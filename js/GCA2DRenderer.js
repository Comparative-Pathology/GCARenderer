/*!
* @file         GCA2DRenderer.js
* @author       Bill Hill
* @date         June 2021
* @version      $Id$
* @par
* Address:
*               Heriot-Watt University,
*               Edinburgh, Scotland, EH14 4AS, UK
* @par
* Copyright (C), [2021],
* Heriot-Watt University, Edinburgh, UK.
* 
* This program is free software; you can redistribute it and/or
* modify it under the terms of the GNU General Public License
* as published by the Free Software Foundation; either version 2
* of the License, or (at your option) any later version.
*
* This program is distributed in the hope that it will be
* useful but WITHOUT ANY WARRANTY; without even the implied
* warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
* PURPOSE.  See the GNU General Public License for more
* details.
*
* You should have received a copy of the GNU General Public
* License along with this program; if not, write to the Free
* Software Foundation, Inc., 51 Franklin Street, Fifth Floor,
* Boston, MA  02110-1301, USA.
* @brief	A 2D rendering system created for the Gut Cell Atlas.
*/

/* globals alert, console, document, fabric, XMLHttpRequest */

/*!
 * @class	GCA2DRenderer
 * @constructor
 * @brief	Creates a Gut Cell Atlas renderer for displaying and
 * 		interacting with 2D models of the reference and gut,
 * 		mid-line paths through the gut, the mid-line paths,
 * 		landmarks and additional markers.
 * @param	win		Parent window.
 * @param	con		Parent container.
 * @param	post_load_fn	Function to run when all models have been
 * 				loaded if defined.
 * @param	pick_fn		Picking function called on pick events if
 * 				defined.
 */
class GCA2DRenderer {
  constructor(win, con, post_load_fn, pick_fn) {
    this.type = 'GCA2DRenderer';
    Object.defineProperty(this, 'version', {value: '2.1.0', writable: false});
    this._win = win;
    this._container = con;
    this._pick_fn = pick_fn;
    this._post_load_fn = post_load_fn;
    this._canvas = undefined;
    this._config = undefined;
    this._cursor = undefined;
    this._pointer = {
      button: 0,
      drag: false,
      drag_threshold_start:  9,
      drag_threshold_end: 1,
      position: new fabric.Point(0, 0)};
    this._model_grp = undefined;
    this._markers_grp = undefined;
    this._landmarks_grp = undefined;
    this._bloom_grp = undefined;
    this._ref_image = undefined;
    this._paths = undefined;
    this._roi = undefined;
    this._bloom = {
      enabled: true,
      contrast: 0.75,
      brightness: 0.75,
      opacity: 0.5,
      radius: 20};
    this._anat_images = {};
    this._file_load_cnt = 0; // Used to wait for all files to be loaded
    this._debug = true;
    this._curPath = 0;	   // Current path
    this._curPathIdx = 0;    // Index of position on current path
    this._roiIdx = [0, 0];   // Indices defining the ROI on current path
    this._debug = false;
    this._icons = {
      pin: {
	url: 'icons/pin.svg',
	prg: undefined},
      cursor: {
	url: 'icons/cursor.svg',
	prg: undefined}};
    this._mapGroupsGCAToDisp = {};
    this._layerKeys = [
	'REFERENCE_IMAGES',
	'ANATOMY_IMAGES',
	'PATHS',
	'ROI',
	'CURSOR',
	'LANDMARKS',
	'LANDMARK_LABELS',
	'MARKERS',
	'MARKER_LABELS',
	'BLOOM'];
    this._layers = {};
 }

  /*!
   * @function	init
   * @brief	Initialisation of the configuration and dsplay canvas.
   * @param	cfg		Configuration file URL or configuration as
   * 				read from a valid configuration file.
   */
  init(cfg) {
    // Canvas
    let c = document.createElement('canvas');
    c.setAttribute('id', 'canvas');
    this._container.appendChild(c);
    this._canvas = new fabric.Canvas('canvas', {
	selection: false,
	fireRightClick: true,
	stopContextMenu: true});
    this._canvas.hoverCursor = 'default';
    // Configuration
    if(this._isArray(cfg)) {
      cfg = cfg[0];
    }
    this._sortLandmarks(cfg);
    this._config = cfg;
    this._findDisplayProps();
    if(this._isDefined(this._config.display_props.pick_precision)) {
      this._config.display_props['pick_precision'] = 1.0;
    }
    // Layers
    let nlk = this._layerKeys.length;
    for(let i = 0; i < nlk; ++i) {
      this._layers[this._layerKeys[i]] = Math.floor((i + 1) * 99 / nlk);
    }
    // Display groups
    this._model_grp = new fabric.Group();
    this._markers_grp = new fabric.Group();
    this._landmarks_grp = new fabric.Group();
    this._bloom_grp = new fabric.Group();
    this._canvas.add(this._model_grp);
    this._canvas.add(this._markers_grp);
    this._canvas.add(this._landmarks_grp);
    this._canvas.add(this._bloom_grp);
    this._mapGroupsGCAToDisp['REFERENCE_IMAGES'] = this._model_grp;
    this._mapGroupsGCAToDisp['ANATOMY_IMAGES'] = this._model_grp;
    this._mapGroupsGCAToDisp['PATHS'] = this._model_grp;
    this._mapGroupsGCAToDisp['ROI'] = this._model_grp;
    this._mapGroupsGCAToDisp['CURSOR'] = this._model_grp;
    this._mapGroupsGCAToDisp['LANDMARKS'] = this._landmarks_grp;
    this._mapGroupsGCAToDisp['LANDMARK_LABELS'] = this._landmarks_grp;
    this._mapGroupsGCAToDisp['MARKERS'] = this._markers_grp;
    this._mapGroupsGCAToDisp['MARKER_LABELS'] = this._markers_grp;
    this._mapGroupsGCAToDisp['BLOOM'] = this._bloom_grp;
    // Interaction
    this._canvas.on('mouse:down', this._onMouseDown.bind(this));
    this._canvas.on('mouse:up', this._onMouseUp.bind(this));
    this._canvas.on('mouse:move', this._onMouseMove.bind(this));
    this._canvas.on('mouse:wheel', this._onMouseWheel.bind(this));
    this._container.onresize = this._onResize.bind(this);
    this._win.addEventListener('resize', this._onResize.bind(this));
  }

  /*
   * @function	getConfig
   * @return	The configuration.
   * @brief	Gets the configuration.
   */
  getConfig() {
    return(this._config);
  }

  /*!
   * @function	loadModels
   * @brief	Loads all files required by the config file.
   *            the models to the renderer. 
   */
  loadModels() {
    this._startLoad();
    this._loadIcons();
    this._loadImages();
    this._loadPaths();
    this._endLoad();
  }

  /*!
   * @function	setProperties
   * @brief	Sets the properties of a single matching display item.
   * @param	grp	GCA group of the item.
   * @param	id	GCA id of the item.
   * @param	prop	Properties to set.
   */
  setProperties(grp, id, prop) {
    let d_itm, d_grp; [d_grp, d_itm] = this.findDispObj(grp, id);
    if(this._isDefined(d_grp) && this._isDefined(d_itm)) {
      // TODO this will probably only work for opacity and visible
      d_itm.set(prop);
      this._renderAll();
    }
  }

  /*!
   * @function	getProperty
   * @return	Property value or undefined if not found.
   * @brief	Gets the value of a display item property.
   * @param     grp     GCA group of the item.
   * @param     id      GCA id of the item.
   * @param	prop	Property to get the value of.
   */
  getProperty(grp, id, prop) {
    let val = undefined;
    let d_itm, d_grp; [d_grp, d_itm] = this.findDispObj(grp, id);
    if(this._isDefined(d_grp) && this._isDefined(d_itm)) {
      val = d_itm.get(prop);
    }
    return(val);
  }

  /*!
   * @function	setPosition
   * @brief	Sets the current position along a path. This is defined
   * 		by a proportion from the first to the second given landmark.
   * 		The position of the ROI is similarly defined using it's
   * 		start and end points.
   * @param	pmk0		Id of the first current position landmark.
   * @param	pmk1		Id of the second current position landmark.
   * @param	pdt		Proportional distance from the first landmark
   * 				to the second for the current position.
   * @param	smk0		Id of the first start of ROI landmark.
   * @param	smk1		Id of the second start of ROI landmark.
   * @param	sdt		Proportional distance from the first start of
   * 				ROI landmark to the second.
   * @param	emk0		Id of the first end of ROI landmark.
   * @param	emk1		Id of the second end of ROI landmark.
   * @param	edt		Proportional distance from the first end of
   * 				ROI landmark to the second.
   */
  setPosition(pmk0, pmk1, pdt,
  			      smk0, smk1, sdt,
			      emk0, emk1, edt) {
    let p = this._positionOnPath(pmk0, pmk1, pdt);
    let rs = this._positionOnPath(smk0, smk1, sdt);
    let re = this._positionOnPath(emk0, emk1, edt);
    this._updatePosition(p[0], p[1], rs[1], re[1]);
  }

    /*!
   * @function  _positionOnPath
   * @return    Array of path index and position index along the path.
   * @brief     Finds the position index on a path which is dst fraction
   * 		from the landmark with id0 toward landmark with id1.
   * 		Both landmarks must be on the same path.
   * @param     lmid0           First landmark with id0.
   * @param     lmid1           Second landmark with id1.
   * @param     dst             Proportional distance.
   */
  _positionOnPath(lmid0, lmid1, dst) {
    let path = undefined;
    let index = undefined;
    let path_index = undefined;
    let mi = [-1, -1];
    let mpi = [-1, -1];
    let mp = [[], []];
    let li = 0;
    let ll = this._config.landmarks.length;
    // Find landmarks and paths with matching ids
    while(((mi[0] < 0) || (mi[1] < 0)) && li < ll) {
      let lmk = this._config.landmarks[li];
      if(lmk.id === lmid0) {
        mi[0] = li;
        mp[0] = lmk.paths;
      }
      if(lmk.id == lmid1) {
        mi[1] = li;
        mp[1] = lmk.paths;
      }
      ++li;
    }
    // If matching landmarks found
    if((mi[0] > -1) && (mi[1] > -1)) {
      // Check if landmarks share a path
      li = 0;
      ll = mp[0].length;
      let jl = mp[1].length;
      while((path === undefined) && li < ll) {
        let ji = 0;
        for(let ji = 0; ji < jl; ++ji) {
          if(mp[0][li] === mp[1][ji]) {
            mpi[0] = li;
            mpi[1] = ji;
            path = mp[0][li];
          }
        }
        ++li;
      }
      if(path !== undefined) {
	path_index = this._pathIdxFromID(path);
        let i0 = this._config.landmarks[mi[0]].position[mpi[0]];
        let i1 = this._config.landmarks[mi[1]].position[mpi[1]];
        index = i0 + Math.floor((i1 - i0) * dst);
        index = this._clamp(index, 0, this._config.paths[path_index].n - 1);
      }
    }
    return([path_index, index]);
  }

    /*!
   * @function  _updatePosition
   * @brief     Update the rendering for a new current path position or
   *            new highlighted ROI.
   * @param     path            Index of path for current position.
   * @param     pathIdx         Index of position on path for current position.
   * @param     roiIdxSrt       Index of position on path for start of ROI.
   * @param     roiIdxEnd       Index of position on path for end of ROI.
   */
  _updatePosition(path, pathIdx, roiIdxSrt, roiIdxEnd) {
    this._curPath = path;
    this._curPathIdx = pathIdx;
    let pd = this._config.paths[this._curPath];
    if(roiIdxSrt < 0) {
      roiIdxSrt = 0;
    }
    if(roiIdxEnd >= pd.n) {
      roiIdxEnd = pd.n - 1;
    }
    this._roiIdx = [roiIdxSrt, roiIdxEnd];
    // Update cursor
    let pos = pd.points[this._curPathIdx];
    let tan = pd.tangents[this._curPathIdx];
    let rot = Math.floor(180 * Math.atan2(-tan.x, tan.y) / Math.PI);
    this._cursor.set({angle: rot});
    this._cursor.setPositionByOrigin(pos, 'center', 'center');
    this._canvas.moveTo(this._cursor, this._layers['CURSOR']);
    // Update roi
    let cp = this._config.paths[this._curPath];
    let gdp = this._config.display_props;
    this._model_grp.remove(this._roi);
    this._canvas.remove(this._roi);
    this._roi = this._makePath(
	cp.points.slice(this._roiIdx[0], this._roiIdx[1] + 1), cp.id, {
	    color: this._parseColor(gdp.path_roi.color),
	    width: gdp.path_roi.line_width,
	    opacity: gdp.path_roi.opacity,
	    bloom: true,
	    visible: gdp.path_roi.visible});
    this._model_grp.add(this._roi);
    this._canvas.moveTo(this._roi, this._layers['ROI']);
    // Update display
    this._renderAll();
  }
  
  /*!
   * @function	findDispObj
   * @return	Array of display group and display object or array with
   * 		display object undefined if not found.
   * @brief	Finds the first display object which has the same GCA group
   * 		and GCA id. If the GCA id is undefined then the first
   * 		object with matching GCA group is found.
   * @param	gca_grp GCA group of the object.GCA2DRenderer.js
   * @param     gca_id 	GCA id of the object.
   */
  findDispObj(gca_grp, gca_id) {
    let d_itm = undefined;
    let d_grp = this._mapGroupsGCAToDisp[gca_grp];
    if(this._isDefined(d_grp)) {
      for(let i = 0; i < d_grp._objects.length; ++i) {
	let itm = d_grp._objects[i];
        if(this._isDefined(itm.gca_id) && this._isDefined(itm.gca_group) &&
	   (gca_grp == itm.gca_group)  &&
	   (!this._isDefined(gca_id) || (gca_id == itm.gca_id))) {
	  d_itm = itm;
	  break;
	}
      }
    }
    return([d_grp, d_itm]);
  }

  /*!
   * @function	findAllDispObj
   * @return	Array of arrays, with each inner array being the display
   *            group and display object found. If no matching objects are
   *            found then an empty array is returned.
   * @brief	Finds all display objects which mave the same GCA group
   * 		and / or GCA id. If the GCA group is undefined then all
   * 		groups are searched, similarly if the GCA id is undefined
   * 		then all objects within the group(s) are found.
   * @param	gca_grp GCA group of the object.
   * @param     gca_id 	GCA id of the object.
   */
  findAllDispObj(gca_grp, gca_id) {
    let objs = [];
    for(let k in this._mapGroupsGCAToDisp) {
      if((!this._isDefined(gca_grp)) || (k === gca_grp)) {
        let d_grp = this._mapGroupsGCAToDisp[k];
	if(this._isDefined(d_grp)) {
	  for(let i = 0; i < d_grp._objects.length; ++i) {
	    let itm = d_grp._objects[i];
            if(this._isDefined(itm.gca_id) && this._isDefined(itm.gca_group) &&
               (k == itm.gca_group) &&
	       (!this._isDefined(gca_id) || (gca_id == itm.gca_id))) {
	       objs.push([d_grp, itm]);
	     }
          }
        }
      }
    }
    return(objs);
  }

  /*!
   * @function	_sortLandmarks
   * @brief	Sorts the landmarks (in place) in the given configuration.
   * 		This is done to ensure that landmarks are  ordered by their
   * 		position along (combined) paths and that we know the number
   * 		of landmarks.
   * @param	cfg	Configuration.
   */
  _sortLandmarks(cfg) {
    cfg.landmarks.sort((a, b) => {
      return(a.position[0] - b.position[0]);
    });
  }

  /*!
   * @function  _findDisplayProps
   * @brief	Find the global display properties and put them where
   * 		easily accessed in the config.
   */
  _findDisplayProps() {
    for(const i in this._config.model_objects) {
      let mo = this._config.model_objects[i];
      if(this._isDefined(mo) && this._isDefined(mo.group) &&
         (mo.group === "GLOBAL_DISPLAY_PROP") &&
	 this._isDefined(mo.display_props)) {
        this._config['display_props'] = mo.display_props;
      }
    }
  }

  /*!
   * @function	_loadIcons
   * @brief	Loads the base marker icons. Currently only one.
   */
  _loadIcons() {
    for(const k in this._icons) {
      this._loadSvg(this._icons[k].url, (obj) => {
	this._icons[k].prg = obj;});
    }
  }

  /*!
   * @function	_loadImages
   * @brief	Loads the reference and anatomy images as specified in the
   * 		config.
   */
  _loadImages() {
    if(this._isDefined(this._config.model_objects)) {
      for(let im = 0; im < this._config.model_objects.length; ++im) {
	let obj = this._config.model_objects[im];
	switch(obj.group) {
	  case 'REFERENCE_IMAGES':
	    if(!this._isDefined(this._ref_image)) {
	      this._loadImage(obj.filepath + '/' + obj.filename, (img) => {
	        this._ref_image = img;
	      });
	    }
	    break;
	  case 'ANATOMY_IMAGES':
	    if(!this._isDefined(this._anat_images[obj.id])) {
	      const obj1 = obj; // Make sure obj passed to function is correct
	      this._loadImage(obj1.filepath + '/' + obj1.filename, (img) => {
	        this._anat_images[obj1.id] = img;
	      });
	    }
	    break;
	  default:
	    break;
	}
      }
    }
  }

  /*!
   * @function	_loadPaths
   * @brief	Loads the path data into the config using the URLs in
   *  		the config.
   *  		The paths are read from JSON files with the format:
   * @verbatim
     {
       "n": <number of points>,
       "points": [[x0,y0],...],
       "tangents": [[x0,y0],...]
     }
     \endverbatim				  
     and converted to arrays of fabric.js points.
   */
  _loadPaths() {
    for(let i = 0; i < this._config.paths.length; ++i) {
      let path = this._config.paths[i];
      let path_data;
      const path1 = path; // Make sure path passed to function is correct
      this._loadJson(path.filepath + '/' + path.spline_filename, (obj) => {
	path1['n'] = obj.n;
	path1['points'] = obj.points;
	path1['tangents'] = obj.tangents;
	let op = obj.points;
	let ot = obj.tangents;
	let np = [];
	let nt = [];
	for(let j = 0; j < obj.n; ++j) {
	  np[j] = new fabric.Point(op[j][0], op[j][1]);
	  nt[j] = new fabric.Point(ot[j][0], ot[j][1]);
	}
	path1['points'] = np;
	path1['tangents'] = nt;
      });
      this._loadJson(path.filepath + '/' + path.map_filename, (obj) => {
        path1['mapping'] = obj;
      });
    }
  }

  /*!
   * @function _createVisualisation
   * @brief	Creates the visualisation once all the files are loaded.
   */
  _createVisualisation() {
    let dp = this._config.display_props;
    /* Setup model objects. */
    if(this._isDefined(this._config.model_objects)) {
      /* We're using alpha compositing to render the images, which is order
       * dependant, so make sure the reference images are rendered first.
       * Here we do this by running through the model objects twice. */
      for(let pass = 0; pass < 2; ++pass) {
	for(let im = 0; im < this._config.model_objects.length; ++im) {
	  let img = undefined;
	  let obj = this._config.model_objects[im];
	  let odp = obj.display_props;
	  switch(obj.group) {
	    case 'REFERENCE_IMAGES':
	      if(pass == 0) {
		if(!this._isDefined(odp)) {
		  obj['display_props'] = {};
		}
		if(!this._isDefined(odp.opacity)) {
		  odp['opacity'] = 1.0;
		}
		if(!this._isDefined(odp.invert)) {
		  odp['invert'] = false;
		}
		img = this._ref_image;
		img.set({
		    opacity: odp.opacity,
		    selectable: false});
		img['gca_id'] = obj.id;
		img['gca_group'] = obj.group;
		if(odp.invert) {
		  let flt = new fabric.Image.filters.Invert();
		  img.filters.push(flt);
		  img.applyFilters();
		}
		this._model_grp.add(img);
		this._canvas.moveTo(img, this._layers['REFERENCE_IMAGES']);
		}
		break;
	    case 'ANATOMY_IMAGES':
	      if(pass != 0) {
		img = this._anat_images[obj.id];
		if(this._isDefined(img)) {
		  if(!this._isDefined(odp)) {
		    obj['display_props'] = {};
		  }
		  if(!this._isDefined(odp.opacity)) {
		    odp['opacity'] = 1.0;
		  }
		  if(!this._isDefined(odp.color)) {
		    odp['color'] = '0xffffff';
		  }
		  img.set({
		      opacity: odp.opacity,
		      selectable: false});
		  let flt = new fabric.Image.filters.BlendColor({
		      color: this._parseColor(odp['color']) });
		  img.filters.push(flt);
		  img.applyFilters();
		  img['gca_id'] = obj.id;
		  img['gca_group'] = obj.group;
		  this._model_grp.add(img);
		  this._canvas.moveTo(img, this._layers['ANATOMY_IMAGES']);
		}
	      }
	      break;
	    default:
	      break;
	  }
	}
      }
    }
    /* Setup paths and region of interest highlight. */
    if(this._isDefined(this._config.paths)) {
      if(!this._isDefined(this._paths)) {
        this._paths = [];
      }
      for(let pi = 0; pi < this._config.paths.length; ++pi) {
	let cp = this._config.paths[pi];
	let pdp = cp.display_props;
        this._paths[pi] = this._makePath(cp.points, cp.id, {
	    color: this._parseColor(pdp.color),
	    width: pdp.line_width,
	    opacity: pdp.opacity,
	    visible: pdp.is_visible});
        this._model_grp.add(this._paths[pi]);
	this._canvas.moveTo(this._paths[pi], this._layers['PATHS']);
      }
      let cp = this._config.paths[this._curPathIdx];
      this._roi = this._makePath(
          cp.points.slice(this._roiIdx[0], this._roiIdx[1] + 1), cp.id, {
	      color: this._parseColor(dp.path_roi.color),
	      width: dp.path_roi.line_width,
	      opacity: dp.path_roi.opacity,
	      visible: dp.path_roi.visible});
      this._model_grp.add(this._roi);
      this._canvas.moveTo(this._roi, this._layers['ROI']);
    }
    /* Setup landmarks. */
    if(this._isDefined(this._config.landmarks)) {
      let lmks = this._config.landmarks;
      for(let il = 0; il < lmks.length; ++il) {
        let l = lmks[il];
	let pi = this._pathIdxFromID(l.paths[0]);
	let pth = this._config.paths[pi];
	let pos = pth.points[l.position[0]];
	let ana = l.anatomy[0];
	let ldp = this._isDefined(l.display_props)? l.display_props: l;
	let lmk = this._makeMarker('pin', pos, l.id, 'LANDMARKS', {
	    color: this._parseColor(ldp.color),
	    visible: ldp.is_visible});
        let lbl_pos = new fabric.Point(pos.x, pos.y);
        if(this._isDefined(ldp.label_offset) &&
	   this._isArray(ldp.label_offset) &&
	   (ldp.label_offset.length > 0)) {
          let ms = this._config.display_props.marker_size;
	  lbl_pos.x += ldp.label_offset[0] * ms;
          lbl_pos.y += ldp.label_offset[1] * ms;
	}
	let lbl = this._makeLabel(lbl_pos, ana.abbreviated_name,
	                      l.id, 'LANDMARK_LABELS', {
	    font_size: this._config.display_props.label_font_size,
	    color: this._parseColor(ldp.color)});
        this._landmarks_grp.add(lmk);
        this._landmarks_grp.add(lbl);
        this._canvas.moveTo(lmk, this._layers['LANDMARKS']);
        this._canvas.moveTo(lbl, this._layers['LANDMARKS']);
      }
    }
    /* Create cursor. */
    let cdp = dp.cursor;
    this._cursor = this._makeCursor({
        color: cdp.color,
	size: cdp.size});
    this._cursor['gca_group'] = 'CURSOR';
    this._model_grp.add(this._cursor);
    this._canvas.moveTo(this._cursor, this._layers['CURSOR']);
    /* Set canvas size. */
    this._onResize();
  }

  /*!
   * @function	_makeCursor
   * @returns	New cursor object for display.
   * @brief	Makes a new display object for display.
   * @param	prop		Cursor properties which may include
   * 				color and size.
   */
  _makeCursor(prop) {
    const def = {
	color: 0xffffff,
	size: 11};
    let sz = this._defordef(prop, def, 'size');
    let color = this._parseColor(this._defordef(prop, def, 'color'));
    let cursor = fabric.util.object.clone(this._icons['cursor'].prg);
    cursor.scaleToHeight(sz);
    cursor.set({stroke: color,
		strokeWidth: (sz / 6) + 1,
                fill: 'rgba(0,0,0,0)'});
    return(cursor);
  }

  /*!
   * @function	_makePath
   * @returns	New path for display.
   * @brief	Makes a new path for display.
   * @param	pts	Array of fabric.js points for the path.
   * @param	id	GCA id of the path.
   * @param 	prop	Path properties which may include
   * 			color, width, opacity, visible.
   */
  _makePath(pts, id, prop) {
    const def = {
      color: 0xffffff,
      width: 3,
      opacity: 1.0,
      bloom: false,
      visible: true
    };
    let pth = new fabric.Polyline(pts, {
        fill: 'transparent',
	selectable: false});
    pth.set({stroke: this._parseColor(this._defordef(prop, def, 'color')),
             opacity: this._defordef(prop, def, 'opacity'),
	     strokeWidth: this._defordef(prop, def, 'width'),
	     visible: this._defordef(prop, def, 'visible')});
    pth['gca_id'] = id;
    pth['gca_group'] = 'PATHS';
    pth['bloom'] = this._defordef(prop, def, 'bloom');
    return(pth);
  }

  /*!
   * @function _makeMarker
   * @returns 	New marker for display.
   * @brief	Makes a new marker for display by cloning one of the
   * 		icons then setting the clones position and other properties.
   * @param	key	Icon key.
   * @param	pos	Required position for the marker.
   * @param	id	GCA id for the marker.
   * @param	grp	GCA group for the marker.
   * @param	prop	Marker properties which may include
   *			color, opacity, height, visible.
   */
  _makeMarker(key, pos, id, grp, prop) { 
    const def = {
      color: 0xffffff,
      opacity: 1.0,
      marker_size: 24,
      visible: true};
    let mrk = fabric.util.object.clone(this._icons[key].prg);
    let hgt = this._defordef(this._config.display_props, def, 'marker_size');
    mrk.scaleToHeight(hgt);
    mrk['gca_id'] = id;
    mrk['gca_group'] = grp;
    mrk['gca_position'] = new fabric.Point(pos.x, pos.y);
    let r = mrk.getBoundingRect();
    mrk.left = pos.x - (r.width / 2);
    mrk.top = pos.y - hgt;
    mrk.set({stroke: this._parseColor(this._defordef(prop, def, 'color')),
             fill: this._parseColor(this._defordef(prop, def, 'color')),
	     opacity: this._defordef(prop, def, 'opacity'),
	     visible: this._defordef(prop, def, 'visible'),
             selectable: false});
    return(mrk);
  }

  /*!
   * @function	_makeLabel
   * @return	A label for display.
   * @brief	Makes a new text label for display, setting the position
   * 		and other properties.
   * @param	pos	Required position for the label.
   * @param	txt	Required text for the label.
   * @param	id	GCA id for the label.
   * @param	grp	GCA group for the label.
   * @param	prop	Label properties which may include
   * 			color, font_size, opacity, visible.
   */
  _makeLabel(pos, txt, id, grp, prop) {
    const def = {
      color: 0xffffff,
      font_size: 14,
      opacity: 1.0,
      visible: true};
    let lbl = new fabric.Text('' + txt, {
      stroke: this._parseColor(this._defordef(prop, def, 'color')),
      fill: this._parseColor(this._defordef(prop, def, 'color')),
      opacity: this._defordef(prop, def, 'opacity'),
      visible: this._defordef(prop, def, 'visible'),
      fontSize: this._defordef(prop, def, 'font_size'),
      fontWeight: 'bold',
      selectable: false});
    lbl.left = pos.x;
    lbl.top = pos.y;
    lbl['gca_id'] = id;
    lbl['gca_group'] = grp;
    return(lbl);
  }

  /*!
   * @function	_pathIdxFromID
   * @return	Index of the path or undefined.
   * @brief	Given a GCA path id finds and returns the index of the
   * 		path in the array of paths.
   * @parm	id	path id.
   */
  _pathIdxFromID(id) {
    let pi = undefined;
    let paths = this._config.paths;
    for(let i = 0; i < paths.length; ++i) {
      let p = paths[i];
      if(p.id == id) {
        pi = i;
	break;
      }
    }
    return(pi);
  }

  /*!
   * @function	_getObjValue
   * @return	The value if the given coordinates are within the object's
   * 		domain, otherwise undefined.
   * @brief	Gets the value of an encoded Woolz object at the given
   * 		coordinates.
   * @param	map	The mapping object.
   * @param	x	The column coordinate.
   * @param	y	The line coordinate.
   */
  _getObjValue(map, x, y) {
    var vidx;
    var inside = false;
    var v = undefined;
    var obj = map['object'];
    var dom = obj.domain;
    var val = obj.values;
    x = Math.trunc(x) - dom.kol1;
    y = Math.trunc(y) - dom.line1;
    if((y >= 0) && (y <= dom.lastln - dom.line1) &&
       (x >= 0) && (x <= dom.lastkl - dom.kol1))
    {
      var ivln = dom.intvlines[y];
      vidx = val.value_line_indices[y];
      for(let i = 0; !inside && (i < ivln.length); ++i) {
        let iv = ivln[i];
        if((x >= iv[0]) && (x <= iv[1])) {
          vidx += x - iv[0];
          inside = true;
          break;
        } else {
          vidx += iv[1] - iv[0] + 1;
        }
      }
    }
    if(inside) {
      v = val.values[vidx];
    }
    return(v);
  }

  /*! 
   * @function 	mapPointToMidline
   * @return	Point on midline or undefined.
   * @brief	Maps the given fabric point to the midline of the current
   * 		path if the given point is within the domain of the mapping.
   * @param	Given point for mapping.
   */
  mapPointToMidline(p) {
    let pom = undefined;
    let pp = undefined;
    let cp = this._config.paths[this._curPath];
    let idx = this._getObjValue(cp.mapping, p.x, p.y);
    if(typeof idx !== 'undefined') {
      // There may be a small mapping error so search small range for
      // closest point.
      pp = cp.points[idx];
    }
    if(typeof pp !== 'undefined') {
      pom = {x: pp.x, y: pp.y, i: idx};
    }
    return(pom);
  }

  /*!
   * @function	addMarker
   * @brief	Adds a marker (with an optional text label).
   * @param	id		Reference id string for the marker.
   * @param	pos		Position of the marker as a fabric point.
   * @param	txt		Optional text for label (may be undefined).
   * @param	props		Optional properties.
   */
  addMarker(id, pos, txt, props) {
    let rad = 5;
    let spos = new fabric.Point(pos.x, pos.y);
    let mpos = this.mapPointToMidline(spos);
    let mapped = this._isDefined(mpos);
    if(mapped) {
      let mrk = this._makeMarker('pin', mpos, id, 'MARKERS', props);
      this._markers_grp.add(mrk);
      this._canvas.moveTo(mrk, this._layers['MARKERS']);
      if(this._isDefined(txt)) {
        let lbl = this._makeLabel(mpos, txt, id, 'MARKER_LABELS', props);
        this._markers_grp.add(lbl);
        this._canvas.moveTo(lbl, this._layers['MARKERS']);
      }
    }
  }

  /*!
   * @function removeMarker
   * @brief	Removes the marker (and it's optional text label) with the
   * 		given reference id.
   * @param	Reference id string of the marker.
   */
  removeMarker(id) {
    const itm = 1;
    const grp = 0;
    let mrk = this.findDispObj('MARKERS', id);
    let lbl = this.findDispObj('MARKER_LABELS', id);
    if(this._isDefined(mrk[grp]) && this._isDefined(mrk[itm])) {
      this._canvas.remove(mrk[itm]);
      this._markers_grp.remove(mrk[itm]);
    }
    if(this._isDefined(lbl[grp]) && this._isDefined(lbl[itm])) {
      this._canvas.remove(lbl[itm]);
      this._markers_grp.remove(lbl[itm]);
    }
  }


  /*!
   * @function  landmarkFromID
   * @return	landmark config or undefined if not found
   * @brief	Given a landmark's GCA id returns te given landmark.
   * @param	id	Required landmark's GCA id
   */
  landmarkFromID(id) {
    var lmk = undefined;
    let lmks = this._config.landmarks;
    for(let li = 0; li < lmks.length; ++li) {
      let l = lmks[li];
      if(l.id === id) {
        lmk = l;
	break;
      }
    }
    return(lmk);
  }

  /*!
   * @function  positionToPath
   * @return    [<path>, <path position index>, <distance>] or undefined
   * @brief	Finds a path which intersects the given position and then
   * 		returns the path and path position index. If a path does
   * 		not pass within the tolerance distance from the position
   * 		then undefined is returned.
   * @param	pos		Position coordinate.
   * @param	tol		Tolerance distance.
   */
  positionToPath(pos, tol) {
    let fnd = [0, 0, Number.MAX_VALUE];
    let pv = new fabric.Point(pos.x, pos.y);
    for(let pi = 0; pi < this._config.paths.length; ++pi) {
      let path = this._config.paths[pi];
      for(let pj = 0; pj < path.n; ++pj) {
        let pp = path.points[pj];
	let pq = new fabric.Point(pp.x - pv.x, pp.y - pv.y);
	let d2 = pq.x * pq.x + pq.y * pq.y;
	if(d2 < fnd[2]) {
	  fnd[0] = pi;
	  fnd[1] = pj;
	  fnd[2] = d2;
	}
      }
    }
    if(fnd[2] < tol) {
      fnd[2] = Math.sqrt(fnd[2]);
    } else {
      fnd = undefined;
    }
    return(fnd);
  }

  /*!
   * @function	this
   * @brief	Responds to a mouse down event by making sure not in a drag
   * 		state and recording the position.
   * @param	e		Event.
   */
  _onMouseDown(e) {
    this._pointer.button = e.button;
    this._pointer.drag = false;
    this._pointer.position = new fabric.Point(e.pointer.x, e.pointer.y);
  }

  /*!
   * @function	_onMouseMove
   * @brief	Responds to a mouse move event if the first mouse button is
   * 		down by panning the canvas recording the position.
   * @param	e		Event.
   */
  _onMouseMove(e) {
    if(this._pointer.button == 1) {
      let del = new fabric.Point(e.pointer.x - this._pointer.position.x,
                                 e.pointer.y - this._pointer.position.y);
      let del2 = (del.x * del.x) + (del.y * del.y);
      if(del2 > this._pointer.drag_threshold_start) {
        this._pointer.drag = true;
      } else if(del2 < this._pointer.drag_threshold_end) {
        this._pointer.drag = false;
      }
      if(this._pointer.drag) {
        this._canvas.relativePan(del);
      }
      this._pointer.position = new fabric.Point(e.pointer.x, e.pointer.y);
    }
  }

  /*!
   * @function	_onMouseUp
   * @brief	Responds to a mouse up event by calling the client pick
   * 		function (if defined and first mouse button was down)
   * 		then making sure not in a drag state.
   * @param	e		Event.
   */
  _onMouseUp(e) {
    if(this._pointer.button == 1)
    {
      if(!this._pointer.drag) {
	let pos = new fabric.Point(e.pointer.x, e.pointer.y);
	let inv = fabric.util.invertTransform(this._canvas.viewportTransform);
	pos = fabric.util.transformPoint(pos, inv);
	if(this._isDefined(this._pick_fn)) {
	  this._pick_fn(this, pos);
	}
      }
    }
    this._pointer.drag = false;
    this._pointer.button = 0;
  }

  /*!
   * @function	_onMouseWheel
   * @brief	Responds to a mouse wheel event by updating the canvas zoom.
   * @param	opt	Object containing event.
   */
  _onMouseWheel(opt) {
    let e = opt.e;
    this._updateZoom(new fabric.Point(e.offsetX, e.offsetY), e.deltaY);
    e.preventDefault();
  }

  /*!
   * @function	_onResize
   * @brief	Responds to a container resize event by resizing the canvas
   * 		and updating the canvas zoom.
   */
  _onResize() {
    if(this._isDefined(this._container) && this._isDefined(this._canvas)) {
      this._canvas.setHeight(this._container.clientHeight);
      this._canvas.setWidth(this._container.clientWidth);
      this._setZoom();
    }
  }

  /*!
   * @function	_setZoom
   * @brief	Sets the canvas zoom so that the entire canvas can be
   * 		displayed in the container.
   */
  _setZoom() {
    if(this._isDefined(this._canvas) && this._isDefined(this._ref_image)) {
      let sx = this._canvas.width / this._ref_image.width;
      let sy = this._canvas.height / this._ref_image.height;
      let s = (sx < sy)? sx: sy;
      if(s > 1.0) {
        s = 1.0;
      }
      let x = s * this._canvas.width / 2;
      let y = s * this._canvas.height / 2;
      // this._canvas.zoomToPoint(new fabric.Point(x, y), s);
      this._canvas.zoomToPoint(new fabric.Point(0, 0), s);
      if(this._debug) {
        console.log('DEBUG viewportTransform ' +
                    this._canvas.viewportTransform[0] + ' ' +
                    this._canvas.viewportTransform[1] + ' ' +
                    this._canvas.viewportTransform[2] + ' ' +
                    this._canvas.viewportTransform[3] + ' ' +
                    this._canvas.viewportTransform[4] + ' ' +
                    this._canvas.viewportTransform[5]);
      }
    }
  }

  /*!
   * @function	_updateZoom
   * @brief	Sets the canvas zoom about a given point given a delta.
   * @param	pos		Centre point for zoom.
   * @param	del		Delta value for zoom from which only the sign
   * 				is used.
   */
  _updateZoom(pos, del) {
    let z = this._canvas.getZoom() * Math.pow(0.95, Math.sign(del));
    this._canvas.zoomToPoint(pos, z);
  }

  /*!
   * @function	_objToBloomImage
   * @return	Image rendered from object.
   * @brief	Creates a new image rendered from the given object with
   * 		bloom.
   * @param	obj		Object to be rendered to an image.
   * @param	bloom		The bloom parameters.
   */
  _objToBloomImage(obj, bloom) {
    let bnd = obj.getBoundingRect();
    bnd.left -= bloom.radius;
    bnd.top -= bloom.radius;
    bnd.width += 2 * bloom.radius;
    bnd.height += 2 * bloom.radius;
    let fac = this._clamp(
        5 * bloom.radius / this._max([bnd.width, bnd.height]), 0.0, 1.0);
    let img = this._renderObjsToImage([obj], this._canvas, bnd, 1.0);
    let flt0 = new fabric.Image.filters.Blur({blur: fac});
    let flt1 = new fabric.Image.filters.Contrast({contrast: bloom.contrast});
    let flt2 = new fabric.Image.filters.Brightness({brightness: bloom.brightness});
    img.filters.push(flt0);
    img.filters.push(flt1);
    img.filters.push(flt2);
    img.applyFilters();
    img.set({opacity: bloom.opacity});
    return(img);
  }

  /*!
   * @function	_renderObjsToImage
   * @return	Image rendered from object.
   * @brief	Creates a new image which contains a rendering of the given
   * 		objects.
   * @param	objs		Array of objects to render to an image.
   * @param	canvas		The current rendering canvas. This has
   * 				parameters saved, modified and then restored.
   * @param	bnd		The boundary of the required image {left,
   * 				top, width, height}.
   * @param	scale		Scale parameter for rendering.
   */
  _renderObjsToImage(objs, canvas, bnd, scale){
    let img = undefined;
    // Save canvas properties
    let	saved = {
	  width: canvas.width,
	  height: canvas.height,
	  interactive: canvas.interactive,
	  contextTop: canvas.contextTop,
	  enableRetinaScaling: canvas.enableRetinaScaling,
	  viewportTransform: canvas.viewportTransform};
    let scaledZoom = canvas.getZoom() * scale;
    let scaledSize = {width: bnd.width * scale, height: bnd.height * scale};
    // Temporarily modify the given canvas
    let cve = fabric.util.createCanvasElement();
    cve.width = scaledSize.width;
    cve.height = scaledSize.height;
    canvas.contextTop = null;
    canvas.enableRetinaScaling = false;
    canvas.interactive = false;
    canvas.viewportTransform = [1.0, 0, 0, 1.0, -bnd.left, -bnd.top];
    canvas.width = scaledSize.width;
    canvas.height = scaledSize.height;
    // Render objects
    canvas.calcViewportBoundaries();
    canvas.renderCanvas(cve.getContext('2d'), objs);
    // Restore canvas properties
    canvas.viewportTransform = saved.viewportTransform;
    canvas.width = saved.width;
    canvas.height = saved.height;
    canvas.calcViewportBoundaries();
    canvas.interactive = saved.interactive;
    canvas.enableRetinaScaling = saved.enableRetinaScaling;
    canvas.contextTop = saved.contextTop;
    img = new fabric.Image(cve);
    img.set(bnd);
    return(img);
  }

  /*! @function	_renderAll
   * @brief	Renders all objects on the canvas. If bloom is enabled
   * 		then this involves two passes through the objects.
   */
  _renderAll() {
    /* Remove any existing bloom images. */
    while(this._bloom_grp._objects.length) {
      let obj = this._bloom_grp._objects.pop();
      this._canvas.remove(obj);
    }
    /* Compute any new bloom images. */
    if(this._bloom.enabled) {
      for(let layer in this._layers) {
	if(layer !== 'BLOOM') {
	  let d_grp = this._mapGroupsGCAToDisp[layer];
	  if(this._isDefined(d_grp)) {
	    for(let i = 0; i < d_grp._objects.length; ++i) {
	      let obj = d_grp._objects[i];
	      if(this._isDefined(obj) && this._isDefined(obj.bloom) &&
		 (obj.bloom == true)) {
		let img = this._objToBloomImage(obj, this._bloom);
		img.set({selectable: false});
		this._bloom_grp.add(img);
		this._canvas.moveTo(img, this._layers['BLOOM']);
	      }
	    }
	  }
	}
      }
    }
    this._canvas.renderAll();
  }


  /*!
   * @function	_loadJson
   * @brief	Loads the JSON file at the given URL.
   * @param	url		URL of the JSON file.
   */
  _loadJson(url, on_load) {
    this._preLoad();
    let req = new XMLHttpRequest();
    req.open('GET', url, false);
    req.overrideMimeType("text/html");
    let rscf = function() {
      if(req.status === 200) {
        let obj = JSON.parse(req.responseText);
        on_load(obj);
        this._postLoad();
      } else {
        alert('Failed to load JSON file ' + url + '.');
      }
    };
    req.onreadystatechange = rscf.bind(this);
    req.send();
  }

  /*!
   * @function	_loadImage
   * @brief	Loads an image from the given URL.
   * @param     url             URL of the image file.
   */
  _loadImage(url, on_load) {
    this._preLoad();
    fabric.Image.fromURL(url, (img, err) => {
      if(err) {
        alert('Failed to load image file ' + url + '.');
      } else {
	on_load(img);
	this._postLoad();
      }
    });
  }

  /*!
   * @function	_loadSvg
   * @brief	Loads an SVG object from the given URL.
   * @param     url             URL of the SVG object.
   */
  _loadSvg(url, on_load) {
    this._preLoad();
    fabric.loadSVGFromURL(url, (obj) => {
      on_load(fabric.util.groupSVGElements(obj));
      this._postLoad();
    });
  }

  /*!
   * @function	_startLoad
   * @brief	Called before loading any files.
   */
  _startLoad() {
    this._file_load_cnt = 1;
  }

  /*!
   * @function  _preLoad
   * @brief	Called before attempting to load required files. Must be
   * 		paired with _postLoad().
   */
  _preLoad() {
    ++(this._file_load_cnt);
  }

  /*!
   * @function  _postLoad
   * @brief	Called after loading required file. Must be paired with
   * 		_preLoad().
   */
  _postLoad() {
    --(this._file_load_cnt);
    if(this._file_load_cnt <= 0) {
      this._createVisualisation();
      if(this._isDefined(this._post_load_fn)) {
        this._post_load_fn();
      }
    }
  }

  /*!
   * @function	_endLoad
   * @brief	Called after all files have been set loading.
   */
  _endLoad() {
    this._postLoad();
  }

  /*!
   * @function	_isDefined
   * @return    True of false.
   * @brief	Test is given parameter is defined.
   * @param	obj			Given parameter.
   */
  _isDefined(x) {
    return(typeof x !== 'undefined');
  }

  /*!
   * @function	_isObject
   * @return    True of false.
   * @brief	Test is given parameter is an object.
   * @param	obj			Given parameter.
   */
  _isObject(x) {
    return(typeof x == 'object');
  }

  /*!
   * @function  _isArray
   * @return	True of false.
   * @brief	Test if given object is an array.
   * @param	obj			Given object.
   */
  _isArray(obj) {
    return(Object.prototype.toString.call(obj) === '[object Array]');
  }

  /*!
   * @function  _isString
   * @return	True of false.
   * @brief	Test if given object is a string.
   * @param	obj			Given object.
   */
  _isString(obj) {
    return(Object.prototype.toString.call(obj) === '[object String]');
  }

  /*!
   * @function	_deforder
   * @return	Given object or given default object.
   * @brief	If defined returns the value with the given key from the
   * 		given object, else returns corresponding default value
   * 		of undefined if the key is not in the default values.	
   * @param	g			Given object.
   * @param	d			Default object.
   * @param	key			Key for given and default object.
   */
  _defordef(g, d, key) {
   let v = undefined;
   if(this._isDefined(g) && (key in g) && this._isDefined(g[key])) {
     v = g[key];
   } else if(this._isDefined(d) && (key in d)) {
     v = d[key];
   }
   return(v);
  }

  /*!
   * @function	_max
   * @return	Maximum value.
   * @brief	Finds the minimum of the given values.
   * @param	vals		Given values.
   */
  _max(vals) {
    let v = vals[0];
    for(let i = 1; i < vals.length; ++i) {
      let u = vals[i];
      if(u > v) {
        v = u;
      }
    }
    return(v);
  }

  /*!
   * @function	_min
   * @return	Minimum value.
   * @brief	Finds the minimum of the given values.
   * @param	vals		Given values.
   */
  _min(vals) {
    let v = vals[0];
    for(let i = 1; i < vals.length; ++i) {
      let u = vals[i];
      if(u < v) {
        v = u;
      }
    }
    return(v);
  }

  /*!
   * @function	_clamp
   * @return	Clamped value.
   * @brief	Clamps the given value to given range.
   * @param	v		Given value.
   * @param	mn		Minimum value of range.
   * @param	mx		Maximum value of range.
   */
  _clamp(v, mn, mx) {
    return(v < mn? mn: v > mx ? mx: v);
  }

  /*!
   * @function 	_parseColor
   * @return	Color in suitable form.
   * @brief	If the given colour is represented as a string of the form
   * 		0xHHHHHH then replace the leading '0x' with '#'.
   */
  _parseColor(gc) {
    let nc = gc;
    if(this._isString(gc)) {
      nc = gc.replace('0x', '#');
    }
    return(nc);
  }
}

export {GCA2DRenderer};

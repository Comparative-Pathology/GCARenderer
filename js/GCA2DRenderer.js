/*!
* \file         GCA2DRenderer.js
* \author       Bill Hill
* \date         June 2021
* \version      $Id$
* \par
* Address:
*               Heriot-Watt University,
*               Edinburgh, Scotland, EH14 4AS, UK
* \par
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
* \brief	A 2D rendering system created for the Gut Cell Atlas.
*/


/*!
 * \function	GCA2DRenderer
 * \brief	Creates a Gut Cell Atlas renderer for displaying and
 * 		interacting with 2D models of the reference and gut,
 * 		mid-line paths through the gut, the mid-line paths,
 * 		landmarks and additional markers.
 * \param	win		Parent window.
 * \param	con		Parent container.
   * \param	post_load_fn	Function to run when all models have been
   * 				loaded if defined.
 * \param	pick_fn		Picking function called on pick events if
 * 				defined.
 */
GCA2DRenderer = function(win, con, post_load_fn, pick_fn) {
  var self = this;
  this.type = 'GCA2DRenderer';
  Object.defineProperty(self, 'version', {value: '0.0.1', writable: false});
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
  this._ref_image = undefined;
  this._paths = undefined;
  this._roi = undefined;
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
  this._layers = {
      REFERENCE_IMAGES: 10,
      ANATOMY_IMAGES: 20,
      PATHS: 40,
      ROI: 50,
      CURSOR: 60,
      LANDMARKS: 70,
      MARKERS: 80};
  
  /*!
   * \function	init
   * \brief	Initialisation of the configuration and dsplay canvas.
   * \param	cfg		Configuration file URL or configuration as
   * 				read from a valid configuration file.
   */
  this.init = function(cfg) {
    let c = document.createElement('canvas');
    c.setAttribute('id', 'canvas');
    self._container.appendChild(c);
    self._canvas = new fabric.Canvas('canvas', {
	selection: false,
	fireRightClick: true,
	stopContextMenu: true});
    if(self._isArray(cfg)) {
      cfg = cfg[0];
    }
    this._sortLandmarks(cfg);
    self._config = cfg;
    this._findDisplayProps();
    if(this._isDefined(self._config.display_props.pick_precision)) {
      self._config.display_props['pick_precision'] = 1.0;
    }
    self._canvas.hoverCursor = 'default';
    self._model_grp = new fabric.Group();
    self._markers_grp = new fabric.Group();
    self._landmarks_grp = new fabric.Group();
    self._canvas.add(self._model_grp);
    self._canvas.add(self._markers_grp);
    self._canvas.add(self._landmarks_grp);
    self._canvas.on('mouse:down', this._onMouseDown);
    self._canvas.on('mouse:up', this._onMouseUp);
    self._canvas.on('mouse:move', this._onMouseMove);
    self._canvas.on('mouse:wheel', this._onMouseWheel);
    self._container.onresize = this._onResize;
    self._win.addEventListener('resize', this._onResize);
  }

  /*
   * \function	getConfig
   * \return	The configuration.
   * \brief	Gets the configuration.
   */
  this.getConfig = function() {
    return(self._config);
  }

  /*!
   * \function	loadModels
   * \brief	Loads all files required by the config file.
   *            the models to the renderer. 
   */
  this.loadModels = function() {
    this._startLoad();
    this._loadIcons();
    this._loadImages();
    this._loadPaths();
    this._endLoad();
  }

  /*!
   * \function	setProperties
   * \brief	Sets the properties of a single matching display item.
   * \param	grp	GCA group of the item.
   * \param	id	GCA id of the item.
   * \param	prop	Properties to set.
   */
  this.setProperties = function(grp, id, prop) {
    let d_itm, d_grp; [d_grp, d_itm] = this.findDispObj(grp, id);
    if(this._isDefined(d_grp) && this._isDefined(d_itm)) {
      // TODO this will probably only work for opacity and visible
      d_itm.set(prop);
      self._canvas.renderAll();
    }
  }

  /*!
   * \function	getProperty
   * \return	Property value or undefined if not found.
   * \brief	Gets the value of a display item property.
   * \param     grp     GCA group of the item.
   * \param     id      GCA id of the item.
   * \param	prop	Property to get the value of.
   */
  this.getProperty = function(grp, id, prop) {
    let val = undefined;
    let d_itm, d_grp; [d_grp, d_itm] = this.findDispObj(grp, id);
    if(this._isDefined(d_grp) && this._isDefined(d_itm)) {
      val = d_itm.get(prop);
    }
    return(val);
  }

  /*!
   * \function	setPosition
   * \brief	Sets the current position along a path. This is defined
   * 		by a proportion from the first to the second given landmark.
   * 		The position of the ROI is similarly defined using it's
   * 		start and end points.
   * \param	pmk0		Id of the first current position landmark.
   * \param	pmk1		Id of the second current position landmark.
   * \param	pdt		Proportional distance from the first landmark
   * 				to the second for the current position.
   * \param	smk0		Id of the first start of ROI landmark.
   * \param	smk1		Id of the second start of ROI landmark.
   * \param	sdt		Proportional distance from the first start of
   * 				ROI landmark to the second.
   * \param	emk0		Id of the first end of ROI landmark.
   * \param	emk1		Id of the second end of ROI landmark.
   * \param	edt		Proportional distance from the first end of
   * 				ROI landmark to the second.
   */
  this.setPosition = function(pmk0, pmk1, pdt,
  			      smk0, smk1, sdt,
			      emk0, emk1, edt) {
    let p = self._positionOnPath(pmk0, pmk1, pdt);
    let rs = self._positionOnPath(smk0, smk1, sdt);
    let re = self._positionOnPath(emk0, emk1, edt);
    this._updatePosition(p[0], p[1], rs[1], re[1]);
  }

    /*!
   * \function  _positionOnPath
   * \return    Array of path index and position index along the path.
   * \brief     Finds the position index on a path which is dst fraction
   * 		from the landmark with id0 toward landmark with id1.
   * 		Both landmarks must be on the same path.
   * \param     lmid0           First landmark with id0.
   * \param     lmid1           Second landmark with id1.
   * \param     dst             Proportional distance.
   */
  this._positionOnPath = function(lmid0, lmid1, dst) {
    let path = undefined;
    let index = undefined;
    let path_index = undefined;
    let mi = [-1, -1];
    let mpi = [-1, -1];
    let mp = [[], []];
    let li = 0;
    let ll = self._config.landmarks.length;
    // Find landmarks and paths with matching ids
    while(((mi[0] < 0) || (mi[1] < 0)) && li < ll) {
      let lmk = self._config.landmarks[li];
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
	path_index = self._pathIdxFromID(path);
        let i0 = self._config.landmarks[mi[0]].position[mpi[0]];
        let i1 = self._config.landmarks[mi[1]].position[mpi[1]];
        index = i0 + Math.floor((i1 - i0) * dst);
        index = this._clamp(index, 0, self._config.paths[path_index].n - 1);
      }
    }
    return([path_index, index]);
  }

    /*!
   * \function  _updatePosition
   * \brief     Update the rendering for a new current path position or
   *            new highlighted ROI.
   * \param     path            Index of path for current position.
   * \param     pathIdx         Index of position on path for current position.
   * \param     roiIdxSrt       Index of position on path for start of ROI.
   * \param     roiIdxEnd       Index of position on path for end of ROI.
   */
  this._updatePosition = function(path, pathIdx, roiIdxSrt, roiIdxEnd) {
    self._curPath = path;
    self._curPathIdx = pathIdx;
    let pd = self._config.paths[self._curPath];
    if(roiIdxSrt < 0) {
      roiIdxSrt = 0;
    }
    if(roiIdxEnd >= pd.n) {
      roiIdxEnd = pd.n - 1;
    }
    self._roiIdx = [roiIdxSrt, roiIdxEnd];
    // Update cursor
    let pos = pd.points[self._curPathIdx];
    let tan = pd.tangents[self._curPathIdx];
    let rot = Math.floor(180 * Math.atan2(-tan.x, tan.y) / Math.PI);
    self._cursor.set({angle: rot});
    self._cursor.setPositionByOrigin(pos, 'center', 'center');
    self._canvas.moveTo(self._cursor, self._layers['CURSOR']);
    // Update roi
    let cp = self._config.paths[self._curPath];
    let gdp = self._config.display_props;
    self._canvas.remove(self._roi);
    self._roi = this._makePath(
	cp.points.slice(self._roiIdx[0], self._roiIdx[1] + 1), cp.id, {
	    color: this._parseColor(gdp.path_roi.color),
	    width: gdp.path_roi.line_width,
	    opacity: gdp.path_roi.opacity,
	    visible: gdp.path_roi.visible});
    self._model_grp.add(self._roi);
    self._canvas.moveTo(self._roi, self._layers['ROI']);
    self._mapGroupsGCAToDisp['ROI'] = self._model_grp;
    /* Make sure the display is updated. */
    self._canvas.renderAll();
  }

  /*!
   * \function	findDispObj
   * \return	Array of display group and display object or array with
   * 		display object undefined if not found.
   * \brief	Finds the first display object which has the same GCA group
   * 		and GCA id. If the GCA id is undefined then the first
   * 		object with matching GCA group is found.
   * \param	gca_grp GCA group of the object.
   * \param     gca_id 	GCA id of the object.
   */
  this.findDispObj = function(gca_grp, gca_id) {
    let d_itm = undefined;
    let d_grp = self._mapGroupsGCAToDisp[gca_grp];
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
   * \function	findAllDispObj
   * \return	Array of arrays, with each inner array being the display
   *            group and display object found. If no matching objects are
   *            found then an empty array is returned.
   * \brief	Finds all display objects which mave the same GCA group
   * 		and / or GCA id. If the GCA group is undefined then all
   * 		groups are searched, similarly if the GCA id is undefined
   * 		then all objects within the group(s) are found.
   * \param	gca_grp GCA group of the object.
   * \param     gca_id 	GCA id of the object.
   */
  this.findAllDispObj = function(gca_grp, gca_id) {
    let objs = [];
    for(let k in self._mapGroupsGCAToDisp) {
      if((!this._isDefined(gca_grp)) || (k === gca_grp)) {
        let d_grp = self._mapGroupsGCAToDisp[k];
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
   * \function	_sortLandmarks
   * \brief	Sorts the landmarks (in place) in the given configuration.
   * 		This is done to ensure that landmarks are  ordered by their
   * 		position along (combined) paths and that we know the number
   * 		of landmarks.
   * \param	cfg	Configuration.
   */
  this._sortLandmarks = function(cfg) {
    cfg.landmarks.sort((a, b) => {
      return(a.position[0] - b.position[0]);
    });
  }

  /*!
   * \function  _findDisplayProps
   * \brief	Find the global display properties and put them where
   * 		easily accessed in the config.
   */
  this._findDisplayProps = function() {
    for(const i in self._config.model_objects) {
      let mo = self._config.model_objects[i];
      if(this._isDefined(mo) && this._isDefined(mo.group) &&
         (mo.group === "GLOBAL_DISPLAY_PROP") &&
	 this._isDefined(mo.display_props)) {
        self._config['display_props'] = mo.display_props;
      }
    }
  }

  /*!
   * \function	_loadIcons
   * \brief	Loads the base marker icons. Currently only one.
   */
  this._loadIcons = function() {
    for(const k in self._icons) {
      this._loadSvg(self._icons[k].url, function(obj) {
	self._icons[k].prg = obj;});
    }
  }

  /*!
   * \function	_loadImages
   * \brief	Loads the reference and anatomy images as specified in the
   * 		config.
   */
  this._loadImages = function() {
    if(this._isDefined(self._config.model_objects)) {
      for(im = 0; im < self._config.model_objects.length; ++im) {
	let obj = self._config.model_objects[im];
	switch(obj.group) {
	  case 'REFERENCE_IMAGES':
	    if(!this._isDefined(self._ref_image)) {
	      this._loadImage(obj.filepath + '/' + obj.filename, function(img) {
	        self._ref_image = img;
	      });
	    }
	    break;
	  case 'ANATOMY_IMAGES':
	    if(!this._isDefined(self._anat_images[obj.id])) {
	      this._loadImage(obj.filepath + '/' + obj.filename, function(img) {
	        self._anat_images[obj.id] = img;
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
   * \function	_loadPaths
   * \brief	Loads the path data into the config using the URLs in
   *  		the config.
   *  		The paths are read from JSON files with the format:
   * \verbatim
     {
       "n": <number of points>,
       "points": [[x0,y0],...],
       "tangents": [[x0,y0],...]
     }
     \endverbatim				  
     and converted to arrays of fabric.js points.
   */
  this._loadPaths = function() {
    for(let i = 0; i < self._config.paths.length; ++i) {
      let path = self._config.paths[i];
      let path_data;
      this._loadJson(path.filepath + '/' + path.spline_filename, function(obj) {
	path['n'] = obj.n;
	path['points'] = obj.points;
	path['tangents'] = obj.tangents;
	let op = obj.points;
	let ot = obj.tangents;
	let np = [];
	let nt = [];
	for(let j = 0; j < obj.n; ++j) {
	  np[j] = new fabric.Point(op[j][0], op[j][1]);
	  nt[j] = new fabric.Point(ot[j][0], ot[j][1]);
	}
	path['points'] = np;
	path['tangents'] = nt;
      });
      this._loadJson(path.filepath + '/' + path.map_filename, function(obj) {
        path['mapping'] = obj;
      });
    }
  }

  /*!
   * \function _createVisualisation
   * \brief	Creates the visualisation once all the files are loaded.
   */
  this._createVisualisation = function() {
    let dp = self._config.display_props;
    /* Setup model objects. */
    if(this._isDefined(self._config.model_objects)) {
      /* We're using alpha compositing to render the images, which is order
       * dependant, so make sure the reference images are rendered first.
       * Here we do this by running through the model objects twice. */
      for(pass = 0; pass < 2; ++pass) {
	for(im = 0; im < self._config.model_objects.length; ++im) {
	  let img = undefined;
	  let obj = self._config.model_objects[im];
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
		img = self._ref_image;
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
		self._model_grp.add(img);
		self._canvas.moveTo(img, self._layers['REFERENCE_IMAGES']);
		self._mapGroupsGCAToDisp['REFERENCE_IMAGES'] = self._model_grp;
		}
		break;
	    case 'ANATOMY_IMAGES':
	      if(pass != 0) {
		img = self._anat_images[obj.id];
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
		  self._model_grp.add(img);
		  self._canvas.moveTo(img, self._layers['ANATOMY_IMAGES']);
		  self._mapGroupsGCAToDisp['ANATOMY_IMAGES'] = self._model_grp;
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
    if(this._isDefined(self._config.paths)) {
      if(!this._isDefined(this._paths)) {
        this._paths = [];
      }
      for(pi = 0; pi < self._config.paths.length; ++pi) {
	let cp = self._config.paths[pi];
	let pdp = cp.display_props;
        self._paths[pi] = this._makePath(cp.points, cp.id, {
	    color: this._parseColor(pdp.color),
	    width: pdp.line_width,
	    opacity: pdp.opacity,
	    visible: pdp.is_visible});
        self._model_grp.add(self._paths[pi]);
	self._canvas.moveTo(self._paths[pi], self._layers['PATHS']);
	self._mapGroupsGCAToDisp['PATHS'] = self._model_grp;
      }
      let cp = self._config.paths[self._curPathIdx];
      self._roi = this._makePath(
          cp.points.slice(self._roiIdx[0], self._roiIdx[1] + 1), cp.id, {
	      color: this._parseColor(dp.path_roi.color),
	      width: dp.path_roi.line_width,
	      opacity: dp.path_roi.opacity,
	      visible: dp.path_roi.visible});
      self._model_grp.add(self._roi);
      self._canvas.moveTo(self._roi, self._layers['ROI']);
      self._mapGroupsGCAToDisp['ROI'] = self._model_grp;
    }
    /* Setup landmarks. */
    if(this._isDefined(self._config.landmarks)) {
      let lmks = self._config.landmarks;
      for(il = 0; il < lmks.length; ++il) {
        let l = lmks[il];
	let pi = self._pathIdxFromID(l.paths[0]);
	let pth = self._config.paths[pi];
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
          let ms = self._config.display_props.marker_size;
	  lbl_pos.x += ldp.label_offset[0] * ms;
          lbl_pos.y += ldp.label_offset[1] * ms
	}
	lbl = this._makeLabel(lbl_pos, ana.abbreviated_name,
	                      l.id, 'LANDMARK_LABELS', {
	    font_size: self._config.display_props.label_font_size,
	    color: this._parseColor(ldp.color)});
        self._landmarks_grp.add(lmk);
        self._landmarks_grp.add(lbl);
        self._canvas.moveTo(lmk, self._layers['LANDMARKS']);
        self._canvas.moveTo(lbl, self._layers['LANDMARKS']);
	self._mapGroupsGCAToDisp['LANDMARKS'] = self._landmarks_grp;
	self._mapGroupsGCAToDisp['LANDMARK_LABELS'] = self._landmarks_grp;
      }
    }
    /* Create cursor. */
    let cdp = dp.cursor;
    self._cursor = this._makeCursor({
        color: cdp.color,
	size: cdp.size});
    self._cursor['gca_group'] = 'CURSOR';
    self._model_grp.add(self._cursor);
    self._canvas.moveTo(self._cursor, self._layers['CURSOR']);
    self._mapGroupsGCAToDisp['CURSOR'] = self._model_grp;
    /* Other groups. */
    self._mapGroupsGCAToDisp['MARKERS'] = self._markers_grp;
    self._mapGroupsGCAToDisp['MARKER_LABELS'] = self._markers_grp;
    /* Set canvas size. */
    self._onResize();
  }

  /*!
   * \function	_makeCursor
   * \returns	New cursor object for display.
   * \brief	Makes a new display object for display.
   * \param	prop		Cursor properties which may include
   * 				color and size.
   */
  this._makeCursor = function(prop) {
    const def = {
	color: 0xffffff,
	size: 11};
    let sz = this._defordef(prop, def, 'size');
    let color = this._parseColor(this._defordef(prop, def, 'color'));
    let cursor = fabric.util.object.clone(self._icons['cursor'].prg);
    cursor.scaleToHeight(sz);
    cursor.set({stroke: color,
		strokeWidth: (sz / 6) + 1,
                fill: 'rgba(0,0,0,0)'});
    return(cursor);
  }

  /*!
   * \function	_makePath
   * \returns	New path for display.
   * \brief	Makes a new path for display.
   * \param	pts	Array of fabric.js points for the path.
   * \param	id	GCA id of the path.
   * \param 	prop	Path properties which may include
   * 			color, width, opacity, visible.
   */
  this._makePath = function(pts, id, prop) {
    const def = {
      color: 0xffffff,
      width: 3,
      opacity: 1.0,
      visible: true
    };
    let pth = new fabric.Polyline(pts, {
        fill: 'transparent',
	selectable: false});
    pth.set({stroke: this._parseColor(this._defordef(prop, def, 'color')),
             opacity: this._defordef(prop, def, 'opacity'),
	     strokeWidth: this._defordef(prop, def, 'width'),
	     visible: this._defordef(prop, def, 'visible')});
    pth['gca_id'] = id,
    pth['gca_group'] = 'PATHS';
    return(pth);
  }

  /*!
   * \function _makeMarker
   * \returns 	New marker for display.
   * \brief	Makes a new marker for display by cloning one of the
   * 		icons then setting the clones position and other properties.
   * \param	key	Icon key.
   * \param	pos	Required position for the marker.
   * \param	id	GCA id for the marker.
   * \param	grp	GCA group for the marker.
   * \param	prop	Marker properties which may include
   *			color, opacity, height, visible.
   */
  this._makeMarker = function(key, pos, id, grp, prop) { 
    const def = {
      color: 0xffffff,
      opacity: 1.0,
      marker_size: 24,
      visible: true};
    let mrk = fabric.util.object.clone(self._icons[key].prg);
    let hgt = this._defordef(self._config.display_props, def, 'marker_size');
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
   * \function	_makeLabel
   * \return	A label for display.
   * \brief	Makes a new text label for display, setting the position
   * 		and other properties.
   * \param	pos	Required position for the label.
   * \param	txt	Required text for the label.
   * \param	id	GCA id for the label.
   * \param	grp	GCA group for the label.
   * \param	prop	Label properties which may include
   * 			color, font_size, opacity, visible.
   */
  this._makeLabel = function(pos, txt, id, grp, prop) {
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
   * \function	_pathIdxFromID
   * \return	Index of the path or undefined.
   * \brief	Given a GCA path id finds and returns the index of the
   * 		path in the array of paths.
   * \parm	id	path id.
   */
  this._pathIdxFromID = function(id) {
    let pi = undefined;
    let paths = self._config.paths;
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
   * \function	_getObjValue
   * \return	The value if the given coordinates are within the object's
   * 		domain, otherwise undefined.
   * \brief	Gets the value of an encoded Woolz object at the given
   * 		coordinates.
   * \param	map	The mapping object.
   * \param	x	The column coordinate.
   * \param	y	The line coordinate.
   */
  this._getObjValue = function(map, x, y) {
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
        iv = ivln[i];
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
   * \function 	mapPointToMidline
   * \return	Point on midline or undefined.
   * \brief	Maps the given fabric point to the midline of the current
   * 		path if the given point is within the domain of the mapping.
   * \param	Given point for mapping.
   */
  this.mapPointToMidline = function(p) {
    let q = undefined;
    let cp = self._config.paths[self._curPath];
    let idx = self._getObjValue(cp.mapping, p.x, p.y);
    if(typeof idx !== 'undefined') {
      // There may be a small mapping error so search small range for
      // closest point.
      b = cp.points[idx];
    }
    if(typeof idx !== 'undefined') {
      q = {x: b.x, y: b.y, i: idx};
    }
    return(q);
  }

  /*!
   * \function	addMarker
   * \brief	Adds a marker (with an optional text label).
   * \param	id		Reference id string for the marker.
   * \param	pos		Position of the marker as a fabric point.
   * \param	txt		Optional text for label (may be undefined).
   * \param	props		Optional properties.
   */
  this.addMarker = function(id, pos, txt, props) {
    let rad = 5;
    let spos = new fabric.Point(pos.x, pos.y);
    let mpos = this.mapPointToMidline(spos);
    let mapped = this._isDefined(mpos);
    if(mapped) {
      let mrk = this._makeMarker('pin', mpos, id, 'MARKERS', props);
      self._markers_grp.add(mrk);
      self._canvas.moveTo(mrk, self._layers['MARKERS']);
      if(this._isDefined(txt)) {
        let lbl = this._makeLabel(mpos, txt, id, 'MARKER_LABELS', props);
        self._markers_grp.add(lbl);
        self._canvas.moveTo(lbl, self._layers['MARKERS']);
      }
    }
  }

  /*!
   * \function removeMarker
   * \brief	Removes the marker (and it's optional text label) with the
   * 		given reference id.
   * \param	Reference id string of the marker.
   */
  this.removeMarker = function(id) {
    let m_itm, d_grp; [m_grp, m_itm] = this.findDispObj('MARKERS', id);
    let l_itm, l_grp; [l_grp, l_itm] = this.findDispObj('MARKER_LABELS', id);
    if(this._isDefined(m_grp) && this._isDefined(m_itm)) {
      self._canvas.remove(m_itm);
      self._markers_grp.remove(m_itm);
    }
    if(this._isDefined(l_grp) && this._isDefined(l_itm)) {
      self._canvas.remove(l_itm);
      self._markers_grp.remove(l_itm);
    }
  }


  /*!
   * \function  landmarkFromID
   * \return	landmark config or undefined if not found
   * \brief	Given a landmark's GCA id returns te given landmark.
   * \param	id	Required landmark's GCA id
   */
  this.landmarkFromID = function(id) {
    var lmk = undefined;
    let lmks = self._config.landmarks;
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
   * \function  positionToPath
   * \return    [<path>, <path position index>, <distance>] or undefined
   * \brief	Finds a path which intersects the given position and then
   * 		returns the path and path position index. If a path does
   * 		not pass within the tolerance distance from the position
   * 		then undefined is returned.
   * \param	pos		Position coordinate.
   * \param	tol		Tolerance distance.
   */
  this.positionToPath = function(pos, tol) {
    let fnd = [0, 0, Number.MAX_VALUE];
    let pv = new fabric.Point(pos.x, pos.y);
    for(let pi = 0; pi < self._config.paths.length; ++pi) {
      let path = self._config.paths[pi];
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
   * \function	_onMouseDown
   * \brief	Responds to a mouse down event by making sure not in a drag
   * 		state and recording the position.
   * \param	e		Event.
   */
  this._onMouseDown = function(e) {
    self._pointer.button = e.button;
    self._pointer.drag = false;
    self._pointer.position = new fabric.Point(e.pointer.x, e.pointer.y);
  }

  /*!
   * \function	_onMouseMove
   * \brief	Responds to a mouse move event if the first mouse button is
   * 		down by panning the canvas recording the position.
   * \param	e		Event.
   */
  this._onMouseMove = function(e) {
    if(self._pointer.button == 1) {
      let del = new fabric.Point(e.pointer.x - self._pointer.position.x,
                                 e.pointer.y - self._pointer.position.y);
      let del2 = (del.x * del.x) + (del.y * del.y);
      if(del2 > self._pointer.drag_threshold_start) {
        self._pointer.drag = true;
      } else if(del2 < self._pointer.drag_threshold_end) {
        self._pointer.drag = false;
      }
      if(self._pointer.drag) {
        self._canvas.relativePan(del);
      }
      self._pointer.position = new fabric.Point(e.pointer.x, e.pointer.y);
    }
  }

  /*!
   * \function	_onMouseUp
   * \brief	Responds to a mouse up event by calling the client pick
   * 		function (if defined and first mouse button was down)
   * 		then making sure not in a drag state.
   * \param	e		Event.
   */
  this._onMouseUp = function(e) {
    if(self._pointer.button == 1)
    {
      if(!self._pointer.drag) {
	let pos = new fabric.Point(e.pointer.x, e.pointer.y);
	let inv = fabric.util.invertTransform(self._canvas.viewportTransform);
	pos = fabric.util.transformPoint(pos, inv);
	if(self._isDefined(self._pick_fn)) {
	  self._pick_fn(self, pos);
	}
      }
    }
    self._pointer.drag = false;
    self._pointer.button = 0;
  }

  /*!
   * \function	_onMouseWheel
   * \brief	Responds to a mouse wheel event by updating the canvas zoom.
   * \param	opt	Object containing event.
   */
  this._onMouseWheel = function(opt) {
    let e = opt.e;
    self._updateZoom(new fabric.Point(e.offsetX, e.offsetY), e.deltaY);
    e.preventDefault();
  }

  /*!
   * \function	_onResize
   * \brief	Responds to a container resize event by resizing the canvas
   * 		and updating the canvas zoom.
   */
  this._onResize = function() {
    if(self._isDefined(self._container) && self._isDefined(self._canvas)) {
      self._canvas.setHeight(self._container.clientHeight);
      self._canvas.setWidth(self._container.clientWidth);
      self._setZoom();
    }
  }

  /*!
   * \function	_setZoom
   * \brief	Sets the canvas zoom so that the entire canvas can be
   * 		displayed in the container.
   */
  this._setZoom = function() {
    if(this._isDefined(self._canvas) && this._isDefined(self._ref_image)) {
      let sx = self._canvas.width / self._ref_image.width;
      let sy = self._canvas.height / self._ref_image.height;
      let s = (sx < sy)? sx: sy;
      if(s > 1.0) {
        s = 1.0;
      }
      let x = s * self._canvas.width / 2;
      let y = s * self._canvas.height / 2;
      // self._canvas.zoomToPoint(new fabric.Point(x, y), s);
      self._canvas.zoomToPoint(new fabric.Point(0, 0), s);
      if(self._debug) {
        console.log('DEBUG viewportTransform ' +
                    self._canvas.viewportTransform[0] + ' ' +
                    self._canvas.viewportTransform[1] + ' ' +
                    self._canvas.viewportTransform[2] + ' ' +
                    self._canvas.viewportTransform[3] + ' ' +
                    self._canvas.viewportTransform[4] + ' ' +
                    self._canvas.viewportTransform[5]);
      }
    }
  }

  /*!
   * \function	_updateZoom
   * \brief	Sets the canvas zoom about a given point given a delta.
   * \param	pos		Centre point for zoom.
   * \param	del		Delta value for zoom from which only the sign
   * 				is used.
   */
  this._updateZoom = function(pos, del) {
    let z = self._canvas.getZoom() * 0.95 ** Math.sign(del);
    self._canvas.zoomToPoint(pos, z)
  }


  /*!
   * \function	_loadJson
   * \brief	Loads the JSON file at the given URL.
   * \param	url		URL of the JSON file.
   */
  this._loadJson = function(url, on_load) {
    self._preLoad();
    let req = new XMLHttpRequest();
    req.open('GET', url, false);
    req.onreadystatechange = function() {
      if(req.status === 200) {
        obj = JSON.parse(req.responseText);
        on_load(obj);
        self._postLoad();
      } else {
        alert('Failed to load JSON file ' + url + '.');
      }
    }
    req.send();
  }

  /*!
   * \function	_loadImage
   * \brief	Loads an image from the given URL.
   * \param     url             URL of the image file.
   */
  this._loadImage = function(url, on_load) {
    self._preLoad();
    fabric.Image.fromURL(url, function(img, err) {
      if(err) {
        alert('Failed to load image file ' + url + '.');
      } else {
	on_load(img);
	self._postLoad();
      }
    });
  }

  /*!
   * \function	_loadSvg
   * \brief	Loads an SVG object from the given URL.
   * \param     url             URL of the SVG object.
   */
  this._loadSvg = function(url, on_load) {
    self._preLoad();
    fabric.loadSVGFromURL(url, function(obj) {
      on_load(fabric.util.groupSVGElements(obj));
      self._postLoad();
    });
  }

  /*!
   * \function	_startLoad
   * \brief	Called before loading any files.
   */
  this._startLoad = function() {
    self._file_load_cnt = 1;
  }

  /*!
   * \function  _preLoad
   * \brief	Called before attempting to load required files. Must be
   * 		paired with _postLoad().
   */
  this._preLoad = function() {
    ++(self._file_load_cnt);
  }

  /*!
   * \function  _postLoad
   * \brief	Called after loading required file. Must be paired with
   * 		_preLoad().
   */
  this._postLoad = function() {
    --(self._file_load_cnt);
    if(self._file_load_cnt <= 0) {
      self._createVisualisation();
      if(this._isDefined(self._post_load_fn)) {
        self._post_load_fn();
      }
    }
  }

  /*!
   * \function	_endLoad
   * \brief	Called after all files have been set loading.
   */
  this._endLoad = function() {
    this._postLoad();
  }

  /*!
   * \function	_isDefined
   * \return    True of false.
   * \brief	Test is given parameter is defined.
   * \param	obj			Given parameter.
   */
  this._isDefined = function(x) {
    return(typeof x !== 'undefined');
  }

  /*!
   * \function	_isObject
   * \return    True of false.
   * \brief	Test is given parameter is an object.
   * \param	obj			Given parameter.
   */
  this._isObject = function(x) {
    return(typeof x == 'object');
  }

  /*!
   * \function  _isArray
   * \return	True of false.
   * \brief	Test if given object is an array.
   * \param	obj			Given object.
   */
  this._isArray = function(obj) {
    return(Object.prototype.toString.call(obj) === '[object Array]');
  }

  /*!
   * \function  _isString
   * \return	True of false.
   * \brief	Test if given object is a string.
   * \param	obj			Given object.
   */
  this._isString = function(obj) {
    return(Object.prototype.toString.call(obj) === '[object String]');
  }

  /*!
   * \function	_deforder
   * \return	Given object or given default object.
   * \brief	If defined returns the value with the given key from the
   * 		given object, else returns corresponding default value
   * 		of undefined if the key is not in the default values.	
   * \param	g			Given object.
   * \param	d			Default object.
   * \param	key			Key for given and default object.
   */
  this._defordef = function(g, d, key) {
   let v = undefined;
   if(this._isDefined(g) && (key in g) && this._isDefined(g[key])) {
     v = g[key];
   } else if(this._isDefined(d) && (key in d)) {
     v = d[key];
   }
   return(v);
  }

  /*!
   * \function	_clamp
   * \return	Clamped vlue.
   * \brief	Clamps the given value to given range.
   * \param	v		Given value.
   * \param	mn		Minimum value of range.
   * \param	mx		Maximum value of range.
   */
  this._clamp = function(v, mn, mx) {
    return(v < mn? mn: v > mx ? mx: v);
  }

  /*!
   * \function 	_parseColor
   * \return	Color in suitable form.
   * \brief	If the given colour is represented as a string of the form
   * 		0xHHHHHH then replace the leading '0x' with '#'.
   */
  this._parseColor = function(gc) {
    if(this._isString(gc)) {
      nc = gc.replace('0x', '#');
    } else {
      nc = gc;
    }
    return(nc);
  }

}

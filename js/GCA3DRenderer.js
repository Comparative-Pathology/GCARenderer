/*!
* \file         GCA3DRenderer.js
* \author       Bill Hill
* \date         May 2021
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
* \brief	A 3D rendering system created for the Gut Cell Atlas.
*/


/*!
 * \function	GCA3DRenderer
 * \brief	Creates a Gut Cell Atlas renderer for displaying and
 * 		interacting with 3D surface models of the reference and gut,
 * 		mid-line paths through the gut, sections through the image
 * 		volume orthogonal to (and centred on) the mid-line paths,
 * 		landmarks and additional markers.
 * \param	wind		Parent window.
 * \param	cont		Parent container.
 * \param	pick		Picking function called on pick events if
 * 				defined.
 */
GCA3DRenderer = function(wind, cont, pick) {
  var self = this;
  this.type = 'GCA3DRenderer';
  this._config = undefined;
  Object.defineProperty(self, 'version', {value: '1.0.0', writable: false});
  this._pickerFn = pick;
  this._curPath = 0;	   	// Current path
  this._curPathIdx = 0;     	// Index of position on current path
  this._roiIdx = [0, 0];	// Indices defining the ROI on current path
  this._ren = new MARenderer(wind, cont);
  this.nameSep = '-';
  this.referenceNamePrefix = 'ref';
  this.anatomyNamePrefix = 'ana';
  this.discNamePrefix = 'disc';
  this.pathNamePrefix = 'path';
  this.landmarkNamePrefix = 'lm';
  this.landmarkNameLblPrefix = 'll';
  this.markerNamePrefix = 'mm';
  this.markerNameLblPrefix = 'ml';

  /*!
   * \function	init
   * \brief	Post creation initialisation.
   * \param	cfg		Configuration file URL or configuration as
   * 				read from a valid configuration file.
   */
  this.init = function(cfg) {
    if(this._isString(cfg)) {
      cfg = self._loadJson(cfg);
    }
    if(this._isArray(cfg)) {
      cfg = cfg[0];
    }
    self._setConfig(cfg);
    this._loadPaths();
    this._ren.init();
    this._ren.markerSizeSet(self._config.display_props.marker_size);
    if(!Boolean(self._config.display_props.pick_precision)) {
      self._config.display_props['pick_precision'] = 1.0;
    }
    self._ren.raycaster.linePrecision =
        self._config.display_props.pick_precision;
    this._ren.win.addEventListener('click', this._ren._pick, false);
    this._ren.addEventListener('pick', self._picker, false);
  }

  /*!
   * \function	addModels
   * \brief	Adds the given set of models to the renderer. These are
   *    	the (optional) reference surface (reference), the anatomy
   *    	surface models (anatomy-%d), disc orthogonal to the path(s)
   *    	(disc), the path(s) (path-%d) and the landmarks.
   * \param	pths		An array of mid-line paths through the colon,
   *				with each path being encoded in a Jsn file
   *				which has the following form:
   */
  this.addModels = function() {
    let name = undefined;
    if(Boolean(self._config.reference_surface)) {
      let ref = self._config.reference_surface;
      let dsp = ref.display_props;
      this._ren.addModel({name:        self.getReferenceName(),
	     	          path:        ref.filepath + '/' + ref.filename,
		          color:       dsp.color,
		          opacity:     dsp.opacity,
			  transparent: true});
    }
    if(Boolean(self._config.anatomy_surfaces) &&
       this._isArray(self._config.anatomy_surfaces) &&
       (self._config.anatomy_surfaces.length > 0)) {
      for(let i = 0, l = self._config.anatomy_surfaces.length; i < l; ++i) {
        let anat = self._config.anatomy_surfaces[i];
	let dsp = anat.display_props;
	this._ren.addModel({name:       self.getAnatomyName(anat.id),
			    path:       anat.filepath + '/' + anat.filename,
			    color:      dsp.color,
			    opacity:	dsp.opacity,
			    transparent: true});
        if(this._isDefined(anat.map_filename)) {
	  anat['mapping'] = this._loadJson(anat.filepath + '/' +
	                                   anat.map_filename);
	}
      }
    }
    let dsc = self._config.disc;
    let dsp = dsc.display_props;
    this._ren.addModel({name:       self.getDiscName(dsc.id),
                       mode:        MARenderMode.SHAPE,
		       style:       MARenderShape.DISC,
		       color:       dsp.color,
		       size:        dsp.radius,
		       extrude:     dsp.thickness});
    for(let i = 0, l = self._config.paths.length; i < l; ++i) {
      let pth = self._config.paths[i];
      let dsp = pth.display_props;
      this._ren.addModel({name:       self.getPathName(pth.id),
                         mode:        MARenderMode.PATH,
		         color:       dsp.color,
		         linewidth:   dsp.line_width,
		         vertices:    pth.points,
		         tangents:    pth.tangents});
    }
    let lof = self._config.display_props.label_offset;
    lof = new THREE.Vector3(lof[0], lof[1], lof[2]);
    for(let i = 0; i < self._config.landmarks.length; ++i) {
      let lmk = self._config.landmarks[i];
      for(let j = 0; j < lmk.paths.length; ++j) {
	let lpi = self._config.pathIdToIdx[lmk.paths[j]];
	let pas = self._config.paths[lpi].points[lmk.position[j]];
	let pos = new THREE.Vector3(pas[0], pas[1], pas[2]);
	self._ren.addModel({name: self.getLandmarkName(lmk.id),
		           mode:  MARenderMode.MARKER,
		           position: pos});
	self._ren.addModel({name: self.getLandmarkLblName(lmk.id),
		           mode:  MARenderMode.LABEL,
		           text:  lmk.anatomy[0].abbreviated_name,
		           position: pos.add(lof)});
      }
    }
  }

  /*!
   * \function	setView
   * \brief	Sets the renderers vieweing parameters.
   *		The views are given in the config, with each havin the
   *		following fields:
   * \verbatim
     {
       "centre": [<x>, <y>, <z>],
       "near": <d>,
       "far": <d>,
       "cam_pos": [<x>, <y>, <z>],
       "up": [<x>, <y>, <z>]
     }
     \endverbatim				  
   * 				where all are floating point numbers.
   * 				The parameters are:
   * 				  - centre -   centre of the scene
   * 				  - near -     near plane of viewing frustum
   * 				  - far -      far plane of viewing frustum
   * 				  - cam_pos - position of the camera
   * 				  - up -       up vector of the camera
   */
  this.setView = function() {
    let dsp = self._config.display_props;
    let v = dsp.model_views[dsp.viewTypeToIdx[dsp.default_view]];
    let c = new THREE.Vector3(v.centre[0], v.centre[1], v.centre[2]);
    let p = new THREE.Vector3(v.cam_pos[0], v.cam_pos[1], v.cam_pos[2]);
    let u  = new THREE.Vector3(v.up[0],  v.up[1],  v.up[2]);
    self._ren.setCamera(c, v.near, v.far, p);
    self._ren.setHome(p, u);
    self._ren.goHome();
  }

  /*!
   * \function	addMarker
   * \brief	Adds a marker (with an optional text label).
   * \param	name		Reference name string for the marker.
   * \param	pos		Position of the marker as an array [x,y,z].
   * \param	col		Colour of the marker.
   * \param	txt		Optional text for label.
   */
  this.addMarker = function(name, pos, col, txt) {
    pos = new THREE.Vector3(pos[0], pos[1], pos[2]);
    self._ren.addModel({name: self.getMarkerName(name),
                        mode:  MARenderMode.MARKER,
		        color: col,
                        position: pos});
    if(txt) {
      let dp = self._config.display_props;
      let lof = new THREE.Vector3(dp.label_offset[0], dp.label_offset[1],
                                  dp.label_offset[2]);
      self._ren.addModel({name: self.getMarkerLblName(name),
                          mode:  MARenderMode.LABEL,
                          text:  txt,
                          position: pos.add(lof)});
    }
  }

  /*!
   * \function 
   * \brief	Removes the marker (and it's optional text label) with the
   * 		given reference name.
   * \param	Reference name string of the marker.
   */
  this.removeMarker = function(name) {
    self._ren.removeModel(self.getMarkerName(name));
    self._ren.removeModel(self.getMarkerLblName(name));
  }

  /*!
   * \function	setPosition
   * \brief	Sets the current position along the colon. This is defined
   * 		by a proportion from the first to the second given landmark.
   * 		The position of the ROI is similarly defined using it's
   * 		start and end points.
   * \param	pmk0		Index of the first current position landmark.
   * \param	pmk1		Index of the second current position landmark.
   * \param	pdt		Proportional distance from the first landmark
   * 				to the second for the current position.
   * \param	smk0		Index of the first start of ROI landmark.
   * \param	smk1		Index of the second start of ROI landmark.
   * \param	sdt		Proportional distance from the first start of
   * 				ROI landmark to the second.
   * \param	emk0		Index of the first end of ROI landmark.
   * \param	emk1		Index of the second end of ROI landmark.
   * \param	edt		Proportional distance from the first end of
   * 				ROI landmark to the second.
   */
  this.setPosition = function(pmk0, pmk1, pdt,
  			      smk0, smk1, sdt,
			      emk0, emk1, edt) {
    let p = self._indexOnPath(pmk0, pmk1, pdt);
    let rs = self._indexOnPath(smk0, smk1, sdt);
    let re = self._indexOnPath(emk0, emk1, edt);
    this._updatePosition(p[0], p[1], rs[1], re[1]);
  }

  /*!
   * \function	setDiscRadius
   * \brief	Sets the disc radius.
   * \param	rad		New disc radius.
   */
  this.setDiscRadius = function(rad) {
    let dsc = self._config.disc;
    dsc.radius = rad;
    let pd = self._config.paths[self._curPath];
    let vtx = pd.points[self._curPathIdx];
    let tan = pd.tangents[self._curPathIdx];
    let ext = dsc.thickness;
    if(!Boolean(ext)) {
      ext = 1.0;
    }
    self._ren.updateModel({name: self.getDiscName(dsc.id),
	size: self._config.disc.radius,
	position: new THREE.Vector3(vtx[0], vtx[1], vtx[2]),
	normal: new THREE.Vector3(tan[0], tan[1], tan[2]),
	extrude: ext});
  }

  /*!
   * \function  animate
   * \brief	Makes render live.
   */
  this.animate = function() {
    self._ren.animate();
  }

  /*!
   * \function	getPosition
   * \return	An array [pmk0, pmk1, pdt] with
   *              - pmk0 - Index of the lower landmark enclosing the given
   *                       path index.
   *              - pmk1 - Index of the upper landmark enclosing the given
   *                       path index.
   *              - pdt -  Proportional distance from the first landmark
   *                       to the second.
   * 		or undefined if the enclosing landmarks can not be found.
   * \brief	Finds the landmarks either side of the given path index
   * 		for the given path along with the proportional distance from
   * 		the first landmark to the second.
   * \param path		The path.
   * \param path_idx		Index along the path.
   */
  this.getPosition = function(path, path_idx) {
    let rtn = undefined;
    let landmarks = self._config.landmarks;
    let lmks = [undefined, undefined];
    let pi = [-1, -1];
    /* Find lower and upper containing landmarks of path_idx. */
    for(let i = 0; i < landmarks.length; ++i)
    {
      let pinp = -1;
      let lmk = landmarks[i];
      for(let j = 0; j < lmk.paths.length; ++j) {
	if(path === lmk.paths[j]) {
	  pinp = j;
	  break;
	}
      }
      if(pinp >= 0) {
	if(lmk.position[pinp] <= path_idx) {
	  if((lmks[0] === undefined) || (i > lmks[0]))
	  {
	    pi[0] = pinp;
	    lmks[0] = i;
	  }
	}
	if(lmk.position[pinp] >= path_idx) {
	  if((lmks[1] === undefined) || (i < lmks[1]))
	  {
	    pi[1] = pinp;
	    lmks[1] = i;
	  }
	}
      }
    }
    if((lmks[0] !== undefined) && (lmks[1] !== undefined)) {
      let p0 = landmarks[lmks[0]].position[pi[0]];
      let p1 = landmarks[lmks[1]].position[pi[1]];
      rtn = [lmks[0], lmks[1], (path_idx - p0) / (p1 - p0)];
    }
    return(rtn);
  }

  /*!
   * \function	getSectionImage
   * \return	URL of the section image.
   * \brief	Computes section image URL at the current position.
   */
  this.getSectionImage = function() {
    let img = undefined;
    if(Boolean(self._config.section_files) &&
       (self._config.section_files.length > self._curPath)) {
      let sf = self._config.section_files[self._curPath];
      let template = sf.filename;
      let rx = /%([0 ]?)(\d*)d/;
      let fmt = template.match(rx);
      let n = parseInt(fmt[2]) || 0;
      let d = String(self._curPathIdx);
      if(n > d.length) {
	d = fmt[1].repeat(n - d.length) + d;
      }
      img = sf.filepath + '/' + template.replace(rx, d);
    }
    return(img);
  }

  /*!
   * \function  positionToPath
   * \return    [<path>, <index>, <dsiatance>] or undefined
   * \brief	Finds a path which intersects the given position and then
   * 		returns the path and path index. If a path does not pass
   * 		within the tolerance distance from the position then
   * 		undefined is returned.
   * \param	pos		Position coordinate array ([x, y, z]).
   * \param	tol		Tolerance distance.
   */
  this.positionToPath = function(pos, tol) {
    let fnd = [0, 0, Number.MAX_VALUE];
    let pv = new THREE.Vector3(pos[0], pos[1], pos[2]);
    for(let pi = 0; pi < self._config.paths.length; ++pi) {
      let path = self._config.paths[pi];
      for(let pj = 0; pj < path.n; ++pj) {
        let pp = path.points[pj];
	let d2 = pv.distanceToSquared(new THREE.Vector3(pp[0],pp[1],pp[2]));
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

 /*! \function	getAnatomyConfig
   *  \return	Anatomy config or undefined if the id is not valid.
   * \brief	Gets the anatomy configutation given an anatomy id.
   * \param	id		GCA anatomy id.
  */
  this.getAnatomyConfig = function(id) {
    let an = undefined;
    let all_an = self._config.anatomy_surfaces;
    for(let i = 0; i <  all_an.length; ++i) {
      if(all_an[i].id === id) {
        an = all_an[i];
	break;
      }
    }
    return(an);
  }

  /*
   * \function	getReferenceName
   * \return	Reference object name. Can be used to find/update reference
   * 		object.
   */
  this.getReferenceName = function() {
    let name = self.referenceNamePrefix + self.nameSep +
               gcaRen._config.reference_surface.id;
    return(name);
  }

  /*
   * \function	getAnatomyName
   * \return	Anatomy object name. Can be used to find/update anatomy
   * 		object.
   * \param	id		GCA anatomy id.
   */
  this.getAnatomyName = function(id) {
    let name = self.anatomyNamePrefix + self.nameSep + id;
    return(name);
  }

  /*
   * \function	getDiscName
   * \return	Disc object name. Can be used to find/update disc
   * 		object.
   * \param	id		GCA anatomy id.
   */
  this.getDiscName = function(id) {
    let name = self.discNamePrefix + self.nameSep + id;
    return(name)
  }

  /*
   * \function	getPathName
   * \return	Path object name. Can be used to find/update path
   * 		object.
   * \param	id		GCA path id.
   */
  this.getPathName = function(id) {
    let pix = self._config.pathIdToIdx[id];
    let name = self.pathNamePrefix + self.nameSep + pix;
    return(name);
  }

  /*
   * \function	getLandmarkName
   * \return	Landmark object name. Can be used to find/update landmark
   * 		object.
   * \param	id		GCA landmark id.
   */
  this.getLandmarkName = function(id) {
    let name = self.landmarkNamePrefix + self.nameSep + id;
    return(name);
  }

  /*
   * \function	getLandmarkLblName
   * \return	Landmark label object name. Can be used to find/update landmark
   * 		label object.
   * \param	id		GCA landmark id.
   */
  this.getLandmarkLblName = function(id) {
    let name = self.landmarkNameLblPrefix + self.nameSep + id;
    return(name);
  }

  /*
   * \function	getMarkerName
   * \return	Marker object name. Can be used to find/update marker
   * 		object.
   * \param	id		Marker id.
   */
  this.getMarkerName = function(id) {
    let name = self.markerNamePrefix + self.nameSep + id;
    return(name);
  }

  /*
   * \function	getMarkerLblName
   * \return	Marker label object name. Can be used to find/update marker
   * 		label object.
   * \param	id		GCA marker id.
   */
  this.getMarkerLblName = function(id) {
    let name = self.markerNameLblPrefix + self.nameSep + id;
    return(name);
  }

  /*!
   * \function  findDispObj
   * \return    Array of display group and display object or array with
   *            display object undefined if not found.
   * \brief     Finds the first display object which has the same GCA group
   *            and GCA id. If the GCA id is undefined then the first
   *            object with matching GCA group is found.
   * \param     gca_grp GCA group of the object.
   * \param     gca_id  GCA id of the object.
   */
  this.findDispObj = function(gca_grp, gca_id) {
    return(this._findDispObjs(gca_grp, gca_id, false));
  }

  /*!
   * \function  findAllDispObj
   * \return    Array of arrays, with each inner array being the display
   *            group and display object found. If no matching objects are
   *            found then an empty array is returned.
   * \brief     Finds all display objects which have the same GCA group
   *            and / or GCA id. If the GCA group is undefined then all
   *            groups are searched, similarly if the GCA id is undefined
   *            then all objects within the group(s) are found.
   * \param     gca_grp GCA group of the object.
   * \param     gca_id  GCA id of the object.
   */
  this.findAllDispObj = function(gca_grp, gca_id) {
    return(this._findDispObjs(gca_grp, gca_id, true));
  }

  /* Support function below here. */

  /*!
   * \function  _isDefined
   * \return    True of false.
   * \brief     Test is given parameter is defined.
   * \param     obj                     Given parameter.
   */
  this._isDefined = function(x) {
    return(typeof x !== 'undefined');
  }

  /*!
   * \function  _isArray
   * \return	True of false;
   * \brief	Convinient test for object being an array.
   */
  this._isArray = function(obj) {
    return(Object.prototype.toString.call(obj) === '[object Array]');
  }

  /*!
   * \function  _isString
   * \return	True of false;
   * \brief	Convinient test for object being a string.
   */
  this._isString = function(obj) {
    return(Object.prototype.toString.call(obj) === '[object String]');
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
   * \function	_baryCoords
   * \return	Barycentric coordinates of the given point.
   * \brief	Computes the barycentric coordinates of the given point.
   * \param	t		Array of the triangle vertex positions.
   * \param	p		Point in triangle.
   */
  this._baryCoords = function(t, p) {
    let b = undefined;
    let t0 = t[0];
    let v0 = new THREE.Vector3(t[1].x - t0.x, t[1].y - t0.y, t[1].z - t0.z);
    let v1 = new THREE.Vector3(t[2].x - t0.x, t[2].y - t0.y, t[2].z - t0.z);
    let v2 = new THREE.Vector3(p.x - t0.x,    p.y - t0.y,    p.z - t0.z);
    let d00 = v0.dot(v0);
    let d01 = v0.dot(v1);
    let d11 = v1.dot(v1);
    let d20 = v2.dot(v0);
    let d21 = v2.dot(v1);
    let d = d00 * d11 - d01 * d01;
    if(d > 0) {
      d = 1.0 / d;
      b = new Array(3);
      b[1] = d * (d11 * d20 - d01 * d21);
      b[2] = d * (d00 * d21 - d01 * d20);
      b[0] = 1.0 - b[1] - b[2];
    }
    return(b);
  }

  /*!
   * \function	_loadJson
   * \return	Object loaded.
   * \brief	Loads the JSON file at the given URL.
   * \param	url		URL of the JSON file.
   */
  this._loadJson = function(url) {
    let obj = undefined;
    let req = new XMLHttpRequest();
    req.open('GET', url, false);
    req.send(null);
    if(req.status === 200) {
      obj = JSON.parse(req.responseText);
    }
    return(obj);
  }

  /*!
   * \function	_setConfig
   * \brief	Sets renderer configuration.
   * \param	Given cfg	configuration.
   */
  this._setConfig = function(cfg) {
    self._config = cfg;
    this._sortCfgLandmarks(cfg);
    this._findCfgPaths();
    this._findCfgModelObjects();
    this._findCfgViews();
  }

  /*!
   * \function	_loadPaths
   * \brief	Loads the path data into the config using the URLs in
   *  		the config.
   *  		The paths are read from JSON files with the format:
   * \verbatim
     {
       "n": <number of points>,
       "points": [[<x0,y0,z0],...],
       "tangents": [[<x0,y0,z0],...]
     }
     \endverbatim				  
   */
  this._loadPaths = function() {
    for(let i = 0, l = self._config.paths.length; i < l; ++i) {
      let path = self._config.paths[i];
      let path_data = this._loadJson(path.filepath + '/' +
                                     path.spline_filename);
      path["n"] = path_data.n;
      path["points"] = path_data.points;
      path["tangents"] = path_data.tangents;
    }
  }

  /*!
   *
   * \function	_sortCfgLandmarks
   * \brief	Sorts the landmarks in place) in the given configuration.
   *  		This is done to ensure that landmarks are ordered by their
   * 		position along (combined) paths.
   */
  this._sortCfgLandmarks = function(cfg) {
    cfg.landmarks.sort((a, b) => {
      let cmp = a.position[0] - b.position[0];
      return(cmp);
    });
  }

  /*!
   * \function  _findCfgModelObjects
   * \brief     Finds model objects and sets easily accessed entries
   * 		in the config:
   * 		  config.display_props     <- GLOBAL_DISPLAY_PROP
   * 		  config.disc              <- DISC
   * 		  config.reference_surface <- REFERENCE_SURFACES
   * 		  config.anatomy_surfaces  <- [ANATOMY_SURFACES]
   *            easily accessed in the config.
   */
  this._findCfgModelObjects = function() {
    let cfg = self._config;
    for(const i in cfg.model_objects) {
      let mo = cfg.model_objects[i];
      if(this._isDefined(mo) && this._isDefined(mo.group)) {
        switch(mo.group) {
	  case 'GLOBAL_DISPLAY_PROP':
            cfg['display_props'] = mo.display_props;
	    break;
	  case 'DISC':
            cfg['disc'] = mo;
	    break;
	  case 'SECTION_FILES':
	    if(!this._isDefined(cfg.section_files)) {
	      cfg['section_files'] = [];
	    }
	    let pi = cfg.pathIdToIdx[mo.path];
	    cfg.section_files[pi] = mo;
	    break;
	  case 'REFERENCE_SURFACES':
	    cfg['reference_surface'] = mo;
	    break;
	  case 'ANATOMY_SURFACES':
	    if(!this._isDefined(cfg.anatomy_surfaces)) {
	      cfg.anatomy_surfaces = [];
	    }
	    cfg.anatomy_surfaces.push(mo);
	    break;
	  default:
	    break;
        }
      }
    }
  }

  /*!
   * \function	_findCfgPaths
   * \brief	Build a look up table from path ids to path indices.
   */
  this._findCfgPaths = function() {
    self._config['pathIdToIdx'] = [];
    for(let i = 0; i < self._config.paths.length; ++i) {
      let p = self._config.paths[i];
      self._config.pathIdToIdx[p.id] = i;
    }
  }

  /*!
   * \function	_findCfgViews
   * \brief	Build a look up table from view types to view indices.
   */
  this._findCfgViews = function() {
    let gdp = self._config.display_props;
    gdp['viewTypeToIdx'] = [];
    for(const i in gdp.model_views) {
      let v = gdp.model_views[i];
      gdp.viewTypeToIdx[v.type] = i;
    }
  }

  /*!
   * \function	_indexOnPath
   * \return	Array of path index and position index along the path.
   * \brief	Finds the index on a path which is dst fraction from the
   * 		landmark lmn0 toward landmark lmn1. Both landmarks must
   * 		be on the same path.
   * \param	lmid0		First landmark id.
   * \param	lmid1		Second landmark id.
   * \param	dst		Proportional distance.
   */
  this._indexOnPath = function(lmid0, lmid1, dst) {
    let path = undefined;
    let path_idx = undefined;
    let index = undefined;
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
      while((path_idx === undefined) && li < ll) {
	let ji = 0;
	for(let ji = 0; ji < jl; ++ji) {
	  if(mp[0][li] === mp[1][ji]) {
	    mpi[0] = li;
	    mpi[1] = ji;
	    path = mp[0][li];
	    path_idx = self._config.pathIdToIdx[path];
	  }
	}
        ++li;
      }
      if(path_idx !== undefined) {
        let i0 = self._config.landmarks[mi[0]].position[mpi[0]];
        let i1 = self._config.landmarks[mi[1]].position[mpi[1]];
	index = i0 + Math.floor((i1 - i0) * dst);
	index = this._clamp(index, 0, self._config.paths[path_idx].n - 1);
      }
    }
    return([path_idx, index]);
  }

  /*!
   * \function	_updateColon
   * \brief	Updates the colon colour(s) and opacity.
   */
  this._updateColon = function() {
    let scene = self._ren.scene;
    for(let i = 0, l = scene.children.length; i < l; ++i) {
      let child = scene.children[i];
      if(child.name.substring(0, 7) === 'anatomy') {
        let s = child.name.split('_');
	if(s.length > 1) {
	  let idx = parseInt(s[1]);
	  if((idx >= 0) && (idx < self._config.anatomy_surfaces.length)) {
	    let anat = self._config.anatomy_surfaces[idx];
	    self._ren.updateModel({name: child.name,
				   color: anat.color,
				   opacity: anat.opacity});
	  }
        }
      }
    }
  }

  /*!
   * \function	_updatePosition
   * \brief	Update the rendering for a new current path position or
   * 		new highlighted ROI.
   * \param	path		Index of path for current position.
   * \param	pathIdx		Index of position on path for current position.
   * \param	roiIdxSrt	Index of position on path for start of ROI.
   * \param	roiIdxEnd	Index of position on path for end of ROI.
   */
  this._updatePosition = function(path, pathIdx, roiIdxSrt, roiIdxEnd) {
    self._curPath = path;
    self._curPathIdx = pathIdx;
    self._roiIdx = [roiIdxSrt, roiIdxEnd];
    //
    let pd = self._config.paths[self._curPath];
    // Update disc
    let dsc = self._config.disc;
    let name = self.getDiscName(dsc.id);
    let vtx = pd.points[self._curPathIdx];
    let tan = pd.tangents[self._curPathIdx];
    let ext = dsc.display_props.thickness;
    if(!Boolean(ext)) {
      ext = 1.0;
    }
    self._ren.updateModel({name: name,
	size: dsc.radius,
	position: new THREE.Vector3(vtx[0], vtx[1], vtx[2]),
	normal: new THREE.Vector3(tan[0], tan[1], tan[2]),
	extrude: ext});
    // Update highlight
    name = 'highlight';
    let vertices = pd.points.slice(self._roiIdx[0], self._roiIdx[1]);
    let tangents = pd.tangents.slice(self._roiIdx[0], self._roiIdx[1]);
    if(self._ren.getObjectByName(name)) {
      self._ren.updateModel({name: name,
	  vertices:   vertices,
	  tangents:   tangents});
    } else {
      self._ren.addModel({name: name,
	  mode:       MARenderMode.PATH,
	  color:      self._config.display_props.path_highlight_color,
	  linewidth:  self._config.display_props.path_highlight_width,
	  vertices:   vertices,
	  tangents:   tangents});
    }
  }

  /*!
   * \function  _findDispObjs
   * \return    Array of display group and display object or array of arrays,
   * 		with each inner array being the display group and display
   * 		object found. If no matching objects are found then an empty
   * 		array is returned.
   * \brief     Finds either the first or all display objects which have the
   * 		same GCA group and / or GCA id. If the GCA group is undefined
   * 		then all groups are searched, similarly if the GCA id is
   * 		undefined then all objects within the group(s) are found.
   * \param     gca_grp GCA group of the object.
   * \param     gca_id  GCA id of the object.
   */
  this._findDispObjs = function(gca_grp, gca_id, all) {
    let objs = [];
    let scene = self._ren.scene;
    for(let i = 0, l = scene.children.length; i < l; ++i) {
      let grp = undefined;
      let id = undefined;
      let obj = scene.children[i];
      let tynm = obj.name.split(self.nameSep);
      if(tynm.length > 1) {
	switch(tynm[0]) {
          case this.referenceNamePrefix:
	    grp = 'REFERENCE_SURFACES';
	    id = tynm[1];
	    break;
          case this.anatomyNamePrefix:
	    grp = 'ANATOMY_SURFACES';
	    id = tynm[1];
	    break;
          case this.discNamePrefix:
	    grp = 'DISC';
            id = tynm[1];
            break;
          case this.pathNamePrefix:
	    grp = 'PATHS';
	    id = tynm[1];
	    break;
          case this.landmarkNamePrefix:
          case this.landmarkNameLblPrefix:
	    grp = 'LANDMARKS';
	    id = tynm[1];
	    break;
          case this.markerNamePrefix:
          case this.markerNameLblPrefix:
	    grp = 'MARKERS';
	    id = tynm[1];
	  default:
	    break;
	}
      }
      if((!this._isDefined(gca_grp) ||
          (this._isDefined(grp) && (gca_grp == grp))) &&
         (!this._isDefined(gca_id) ||
          (this._isDefined(id) && (gca_id == id)))) {
	if(all) {
	  objs.push([grp, obj]);
	} else {
	  objs = [grp, obj];
          break;
	}
      }
    }
    return(objs);
  }

  /*!
   * \function	_picker
   * \brief	Processes pick events before passing them on to the
   * 		client picker function.
   * 		Currently only paths, landmarks and markers are handled
   * 		by this function, all other objects are ignored. The
   * 		first path and/or the first landmarks/marker hit are passed
   * 		on to the client function, which is called as:
   *  		  picker(ev, obj, typ, nam, pos)
   *  		where:
   *  		  - ev  - The event.
   *  		  - obj - Array of Three.js / MARender.js objects.
   *  		  - typ - Array of GCARenderer.js types of objects that
   *  		          can be picked, these are one of 'path' (path),
   *  		          'lmkm' (landmark) or 'mrkm' (marker).
   *              - nam - Array of names as used to create the objects.
   *              - pos - Array of position coordinate arrays ([x, y, z]).
   * 		The obj, typ, name and pos arrays are of the same length.
   * \parma	ev		Event.
   */
  this._picker = function(ev) {
    if(ev && ev.type && (ev.type === 'pick') && self._picker) {
      /* Find hit on path object nearest to centroid of hits, but
       * any hit on a landmark or marker will take priority. */
      let idx = {pth: -1, mkm: -1, ana: -1};
      let cnt = [];
      let objA = [];
      let typA = [];
      let namA = [];
      let posA = [];
      let triA = [];
      for(let i = 0, l = ev.hitlist.length; i < l; ++i) {
	let hit = ev.hitlist[i];
	obj = hit.object;
	if(obj && obj.name) {
	  tynm = obj.name.split(self.nameSep);
	  if(tynm.length > 1) {
	    if(tynm.length > 2) {
	      tynm = [tynm[0], tynm.slice(1).join(self.nameSep)];
	    }
	    if(tynm[0] === self.pathNamePrefix) {
	      if(idx.pth < 0) {
		idx.pth = objA.length;
		cnt.push(1);
		objA.push(obj);
		typA.push(tynm[0]);
		namA.push(tynm[1]);
		posA.push(hit.point);
		triA.push(0);
	      } else if(tynm[1] === namA[idx.pth]) {
		++(cnt[idx.pth]);
		posA[idx.pth].add(hit.point);
	      }
	    } else if((tynm[0] === self.landmarkNamePrefix) ||
	              (tynm[0] === self.markerNamePrefix)) {
	      if(idx.mkm < 0) {
		idx.mkm = objA.length;
		cnt.push(1);
		objA.push(obj);
		typA.push(tynm[0]);
		namA.push(tynm[1]);
		posA.push(hit.point);
		triA.push(0);
	      } else if((tynm[0] === typA[idx.pth]) &&
		        (tynm[1] === namA[idx.pth])){
		++(cnt[idx.pth]);
		posA[idx.pth].add(hit.point);
	      }
	    } else if(tynm[0] === self.anatomyNamePrefix) {
	      if(idx.ana < 0) {
	        idx.ana  = objA.length;
                cnt.push(1);
		objA.push(obj);
		typA.push(tynm[0]);
		namA.push(tynm[1]);
		posA.push(hit.point);
		triA.push(hit.faceIndex);
              }
	    }
	  }
	}
      }
      if(objA.length > 0) {
	for(let i = 0; i < objA.length; ++i) {
	  if(typA[i] === self.anatomyNamePrefix) {
	    /* Map anatomy surface hit to path if possible. */
	    let g = objA[i].geometry;
	    let an = self.getAnatomyConfig(namA[i]);
	    if(self._isDefined(an) && self._isDefined(an.mapping) &&
	       self._isDefined(g.index)  &&
	       self._isDefined(g.attributes.position)){
	      let t = triA[i] * 3;
	      let ti = [g.index.array[t], g.index.array[t + 1],
	                g.index.array[t + 2]];
	      let p = g.attributes.position.array;
	      let tv = new Array(3);
	      let mp = new Array(3);
	      for(j = 0; j < 3; ++j) {
		v = ti[j] * 3;
		mp[j] = an.mapping[ti[i]];
	        tv[j] = new THREE.Vector3(p[v], p[v + 1], p[v + 2]);
	      }
	      // Do barycentric interpolation in triangle
	      tw = self._baryCoords(tv, posA[i]);
	      pi = Math.floor(mp[0] * tw[0] + mp[1] * tw[1] + mp[2] * tw[2]);
	      // Compute path coordinates
	      let path = self._config.paths[self._curPath];
	      pi = self._clamp(pi, 0, path.n - 1);
	      posA[i] = path.points[pi];
	    }
	  } else {
	    let p = posA[i].divideScalar(cnt[i]);
	    posA[i] = [p.x, p.y, p.z];
	  }
	}
	self._pickerFn(ev, objA, typA, namA, posA);
      }
    }
  }
}

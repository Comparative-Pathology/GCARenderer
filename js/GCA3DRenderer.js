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
  this.config = undefined;
  Object.defineProperty(self, 'version', {value: '0.0.3', writable: false});
  this.picker = pick;
  this.curPath = 0;	   // Current path
  this.curPathIdx = 0;     // Index of position on current path
  this.roiIdx = [0, 0];	   // Indices defining the ROI on current path
  this.ren = new MARenderer(wind, cont);

  /*!
   * \function	init
   * \brief	Post creation initialisation.
   * \param	cfg		Configuration file URL or configuration as
   * 				read from a valid configuration file.
   */
  this.init = function(cfg) {
    if(this._isString(cfg)) {
      self._setConfig(self._loadJson(cfg));
    } else {
      self._setConfig(cfg);
    }
    this._loadPaths();
    this.ren.init();
    this.ren.markerSizeSet(self.config.display_prop.marker_size);
    if(!Boolean(self.config.display_prop.pick_precision)) {
      self.config.display_prop["pick_precision"] = 1.0;
    }
    self.ren.raycaster.linePrecision = self.config.display_prop.pick_precision;
    this.ren.win.addEventListener('click', this.ren._pick, false);
    this.ren.addEventListener('pick', self._picker, false);
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
    if(Boolean(self.config.reference_surface)) {
      let ref = self.config.reference_surface;
      let dsp = ref.display_prop;
      this.ren.addModel({name:        'reference',
	     	         path:        ref.file,
		         color:       dsp.color,
		         opacity:     dsp.opacity,
			 transparent: true});
    }
    if(Boolean(self.config.anatomy_surfaces) &&
       this._isArray(self.config.anatomy_surfaces) &&
       (self.config.anatomy_surfaces.length > 0)) {
      for(let i = 0, l = self.config.anatomy_surfaces.length; i < l; ++i) {
        let anat = self.config.anatomy_surfaces[i];
	let dsp = anat.display_prop;
	this.ren.addModel({name:        'anatomy-' + i.toString(),
			   path:        anat.file,
			   color:       dsp.color,
			   opacity:	dsp.opacity,
			   transparent: true});
      }
    }
    this.ren.addModel({name:        'disc',
                       mode:        MARenderMode.SHAPE,
		       style:       MARenderShape.DISC,
		       color:       self.config.disc.color,
		       size:        self.config.disc.radius,
		       extrude:     self.config.disc.thickness});
    for(let i = 0, l = self.config.paths.length; i < l; ++i) {
      let path = self.config.paths[i];
      let dsp = path.display_prop;
      this.ren.addModel({name:        'path-' + i.toString(),
                         mode:        MARenderMode.PATH,
		         color:       dsp.color,
		         linewidth:   dsp.width,
		         vertices:    path.points,
		         tangents:    path.tangents});
    }
    let lof = self.config.display_prop.label_offset;
    lof = new THREE.Vector3(lof[0], lof[1], lof[2]);
    for(let i = 0, l = self.config.landmarks.length; i < l; ++i) {
      let lmk = self.config.landmarks[i];
      let lmn = lmk.id;
      for(let i = 0, l = lmk.paths.length; i < l; ++i) {
	let pas = self.config.paths[lmk.paths[i]].points[lmk.indices[i]];
	let pos = new THREE.Vector3(pas[0], pas[1], pas[2]);
	self.ren.addModel({name: 'lmkm-' + lmn,
		           mode:  MARenderMode.MARKER,
		           position: pos});
	self.ren.addModel({name: 'lmkl-' + lmn,
		           mode:  MARenderMode.LABEL,
		           text:  lmk.display_text,
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
    let dsp = self.config.display_prop;
    let v = dsp.views[dsp.default_view];
    let c = new THREE.Vector3(v.centre[0], v.centre[1], v.centre[2]);
    let p = new THREE.Vector3(v.cam_pos[0], v.cam_pos[1], v.cam_pos[2]);
    let u  = new THREE.Vector3(v.up[0],  v.up[1],  v.up[2]);
    self.ren.setCamera(c, v.near, v.far, p);
    self.ren.setHome(p, u);
    self.ren.goHome();
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
    self.ren.addModel({name: 'mrkm-' + name,
                       mode:  MARenderMode.MARKER,
		       color: col,
                       position: pos});
    if(txt) {
      let dp = self.config.display_prop;
      let lof = new THREE.Vector3(dp.label_offset[0], dp.label_offset[1],
                                  dp.label_offset[2]);
      self.ren.addModel({name: 'mrkl-' + name,
                         mode:  MARenderMode.LABEL,
                         text:  txt,
                         position: pos.add(lof)});
    }
  }

  /*!
   * \function removeMarker
   * \brief	Removes the marker (and it's optional text label) with the
   * 		given reference name.
   * \param	Reference name string of the marker.
   */
  this.removeMarker = function(name) {
    self.ren.removeModel('mrkm-' + name);
    self.ren.removeModel('mrkl-' + name);
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
    self.config.disc.radius = rad;
    let pd = self.config.paths[self.curPath];
    let vtx = pd.points[self.curPathIdx];
    let tan = pd.tangents[self.curPathIdx];
    let ext = self.config.disc.thickness;
    if(!Boolean(ext)) {
      ext = 1.0;
    }
    self.ren.updateModel({name: 'disc',
	size: self.config.disc.radius,
	position: new THREE.Vector3(vtx[0], vtx[1], vtx[2]),
	normal: new THREE.Vector3(tan[0], tan[1], tan[2]),
	extrude: self.config.disc.thickness});
  }

  /*!
   * \function  animate
   * \brief	Makes render live.
   */
  this.animate = function() {
    self.ren.animate();
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
    let landmarks = self.config.landmarks;
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
	if(lmk.indices[pinp] <= path_idx) {
	  if((lmks[0] === undefined) || (i > lmks[0]))
	  {
	    pi[0] = pinp;
	    lmks[0] = i;
	  }
	}
	if(lmk.indices[pinp] >= path_idx) {
	  if((lmks[1] === undefined) || (i < lmks[1]))
	  {
	    pi[1] = pinp;
	    lmks[1] = i;
	  }
	}
      }
    }
    if((lmks[0] !== undefined) && (lmks[1] !== undefined)) {
      let p0 = landmarks[lmks[0]].indices[pi[0]];
      let p1 = landmarks[lmks[1]].indices[pi[1]];
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
    if(Boolean(self.config.section_files) &&
       (self.config.section_files.length > self.curPath)) {
      let template = self.config.section_files[self.curPath];
      let rx = /%([0 ]?)(\d*)d/;
      let fmt = template.match(rx);
      let n = parseInt(fmt[2]) || 0;
      let d = String(self.curPathIdx);
      if(n > d.length) {
	d = fmt[1].repeat(n - d.length) + d;
      }
      img = template.replace(rx, d);
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
    for(let pi = 0; pi < self.config.paths.length; ++pi) {
      let path = self.config.paths[pi];
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

  /* Support function below here. */

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
    /* Sort landmarks by minimum path and then distance. */
    cfg.landmarks.sort((a, b) => {
				   return(a.indices[0] - b.indices[0]);
			         });
    /* Set the configuration. */
    self.config = cfg;
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
    for(let i = 0, l = self.config.paths.length; i < l; ++i) {
      let path = self.config.paths[i];
      let path_data = this._loadJson(path.file);
      path["n"] = path_data.n;
      path["points"] = path_data.points;
      path["tangents"] = path_data.tangents;
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
    let index = undefined;
    let mi = [-1, -1];
    let mpi = [-1, -1];
    let mp = [[], []];
    let li = 0;
    let ll = self.config.landmarks.length;
    // Find landmarks and paths with matching ids
    while(((mi[0] < 0) || (mi[1] < 0)) && li < ll) {
      let lmk = self.config.landmarks[li];
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
        let i0 = self.config.landmarks[mi[0]].indices[mpi[0]];
        let i1 = self.config.landmarks[mi[1]].indices[mpi[1]];
	index = i0 + Math.floor((i1 - i0) * dst);
	index = this._clamp(index, 0, self.config.paths[path].n - 1);
      }
    }
    return([path, index]);
  }

  /*!
   * \function	_updateColon
   * \brief	Updates the colon colour(s) and opacity.
   */
  this._updateColon = function() {
    let scene = self.ren.scene;
    for(let i = 0, l = scene.children.length; i < l; ++i) {
      let child = scene.children[i];
      if(child.name.substring(0, 7) === 'anatomy') {
        let s = child.name.split('_');
	if(s.length > 1) {
	  let idx = parseInt(s[1]);
	  if((idx >= 0) && (idx < self.config.anatomy_surfaces.length)) {
	    let anat = self.config.anatomy_surfaces[idx];
	    self.ren.updateModel({name: child.name,
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
    self.curPath = path;
    self.curPathIdx = pathIdx;
    self.roiIdx = [roiIdxSrt, roiIdxEnd];
    //
    let pd = self.config.paths[self.curPath];
    // Update disc
    let name = 'disc';
    let vtx = pd.points[self.curPathIdx];
    let tan = pd.tangents[self.curPathIdx];
    self.ren.updateModel({name: name,
	size: self.config.disc.radius,
	position: new THREE.Vector3(vtx[0], vtx[1], vtx[2]),
	normal: new THREE.Vector3(tan[0], tan[1], tan[2])});
    // Update highlight
    name = 'highlight';
    let vertices = pd.points.slice(self.roiIdx[0], self.roiIdx[1]);
    let tangents = pd.tangents.slice(self.roiIdx[0], self.roiIdx[1]);
    if(self.ren.getObjectByName(name)) {
      self.ren.updateModel({name: name,
	  vertices:   vertices,
	  tangents:   tangents});
    } else {
      self.ren.addModel({name:       name,
	  mode:       MARenderMode.PATH,
	  color:      self.config.display_prop.path_highligh_color,
	  linewidth:  self.config.display_prop.path_highligh_width,
	  vertices:   vertices,
	  tangents:   tangents});
    }
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
    if(ev && ev.type && (ev.type === 'pick') && self.picker) {
      /* Find hit on path object nearest to centroid of hits, but
       * any hit on a landmark or marker will take priority. */
      let idx = {pth: -1, mkm: -1};
      let cnt = [];
      let objA = [];
      let typA = [];
      let namA = [];
      let posA = [];
      for(let i = 0, l = ev.hitlist.length; i < l; ++i) {
	let hit = ev.hitlist[i];
	obj = hit.object;
	if(obj && obj.name) {
	  tynm = obj.name.split('-');
	  if(tynm.length > 1) {
	    if(tynm.length > 2) {
	      tynm = [tynm[0], tynm.slice(1).join('-')];
	    }
	    if(tynm[0] === 'path') {
	      if(idx.pth < 0) {
		idx.pth = objA.length;
		cnt.push(1);
		objA.push(obj);
		typA.push(tynm[0]);
		namA.push(tynm[1]);
		posA.push(hit.point);
	      } else if(tynm[1] === namA[idx.pth]) {
		++(cnt[idx.pth]);
		posA[idx.pth].add(hit.point);
	      }
	    } else if((tynm[0] === 'lmkm') || (tynm[0] === 'mrkm')) {
	      if(idx.mkm < 0) {
		cnt.push(1);
		idx.mkm = objA.length;
		objA.push(obj);
		typA.push(tynm[0]);
		namA.push(tynm[1]);
		posA.push(hit.point);
	      } else if((tynm[0] === typA[idx.pth]) &&
		        (tynm[1] === namA[idx.pth])){
		++(cnt[idx.pth]);
		posA[idx.pth].add(hit.point);
	      }
	    }
	  }
	}
      }
      if(objA.length > 0) {
	for(let i = 0; i < objA.length; ++i) {
	  let p = posA[i].divideScalar(cnt[i]);
	  posA[i] = [p.x, p.y, p.z];
	}
	self.picker(ev, obj, typA, namA, posA);
      }
    }
  }
}

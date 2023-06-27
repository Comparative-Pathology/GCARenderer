/*!
* @file         GCA3DRenderer.js
* @author       Bill Hill
* @date         May 2021
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
* @brief	A 3D rendering system created for the Gut Cell Atlas.
*/

import * as THREE from './three.module.js';
import {MARenderer, MARenderMode, MARenderShape} from './MARender.js';

/* globals XMLHttpRequest */

/*!
 * @class	GCA3DRenderer
 * @constructor
 * @brief	Creates a Gut Cell Atlas renderer for displaying and
 * 		interacting with 3D surface models of the reference and gut,
 * 		mid-line paths through the gut, sections through the image
 * 		volume orthogonal to (and centred on) the mid-line paths,
 * 		landmarks and additional markers.
 * @param	wind		Parent window.
 * @param	cont		Parent container.
 * @param	pick		Picking function called on pick events if
 * 				defined.
 */
class GCA3DRenderer {
  constructor(wind, cont, pick) {
    this.type = 'GCA3DRenderer';
    this._config = undefined;
    Object.defineProperty(this, 'version', {value: '2.2.1', writable: false});
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
    this.trackNamePrefix = 'track';
    this.landmarkNamePrefix = 'lm';
    this.landmarkNameLblPrefix = 'll';
    this.markerNamePrefix = 'mm';
    this.markerNameLblPrefix = 'ml';
  }

  /**
   * @class	GCA3DRenderer
   * @function	init
   * @brief	Post creation initialisation.
   * @param	cfg		Configuration file URL or configuration as
   * 				read from a valid configuration file.
   */
  init(cfg) {
    if(this._isString(cfg)) {
      cfg = this._loadJson(cfg);
    }
    if(this._isArray(cfg)) {
      cfg = cfg[0];
    }
    this._setConfig(cfg);
    this._loadPaths();
    this._ren.init();
    if(!Boolean(this._config.display_props.pick_precision)) {
      this._config.display_props['pick_precision'] = 1.0;
    }
    this._ren.raycaster.linePrecision =
        this._config.display_props.pick_precision;
    this._ren.win.addEventListener('pointerdown', this._ren._pick.bind(this._ren),
        false);
    this._ren.win.addEventListener('pointerup', this._ren._pick.bind(this._ren),
        false);
    this._ren.addEventListener('pick', this._picker.bind(this), false);
  }

  /**
   * @class	GCA3DRenderer
   * @function	getConfig
   * @return	Config data structure.
   * @brief	Gets config data structure.
   */
  getConfig() {
    return(this._config);
  }

  /**
   * @class	GCA3DRenderer
   * @function	addModels
   * @brief	Adds the given set of models to the renderer. These are
   *    	the (optional) reference surface (reference), the anatomy
   *    	surface models (anatomy-%d), disc orthogonal to the path(s)
   *    	(disc), the path(s) (path-%d) and the landmarks.
   * @param	pths		An array of mid-line paths through the colon,
   *				with each path being encoded in a Jsn file
   *				which has the following form:
   */
  addModels() {
    let name = undefined;
    if(Boolean(this._config.reference_surfaces) &&
       this._isArray(this._config.reference_surfaces) &&
       (this._config.reference_surfaces.length > 0)) {
      for(let i = 0, l = this._config.reference_surfaces.length; i < l; ++i) {
        let ref = this._config.reference_surfaces[i];
	let dsp = ref.display_props;
        this._ren.addModel({name:        this.getReferenceName() + String(i),
	                    path:	 this._config.model_dir +
			                 ref.filepath + '/' + ref.filename,
			    color:	 dsp.color,
			    opacity:	 dsp.opacity,
			    transparent: true});
      }
    }
    if(Boolean(this._config.anatomy_surfaces) &&
       this._isArray(this._config.anatomy_surfaces) &&
       (this._config.anatomy_surfaces.length > 0)) {
      for(let i = 0, l = this._config.anatomy_surfaces.length; i < l; ++i) {
        let anat = this._config.anatomy_surfaces[i];
	let dsp = anat.display_props;
	this._ren.addModel({name:       this.getAnatomyName(anat.id),
			    path:       this._config.model_dir +
		                        anat.filepath + '/' + anat.filename,
			    color:      dsp.color,
			    opacity:	dsp.opacity,
			    transparent: true});
        if(this._isDefined(anat.map_filename)) {
	  anat['mapping'] = this._loadJson(this._config.model_dir +
	                                   anat.filepath + '/' +
	                                   anat.map_filename);
	}
      }
    }
    let dsc = this._config.disc;
    let dsp = dsc.display_props;
    this._ren.addModel({name:       this.getDiscName(dsc.id),
                       mode:        MARenderMode.SHAPE,
		       style:       MARenderShape.DISC,
		       color:       dsp.color,
		       size:        dsp.radius,
		       extrude:     dsp.thickness});
    for(let i = 0, l = this._config.paths.length; i < l; ++i) {
      let pth = this._config.paths[i];
      let dsp = pth.display_props;
      this._ren.addModel({name:       this.getPathName(pth.id),
                         mode:        MARenderMode.PATH,
		         color:       dsp.color,
		         linewidth:   dsp.line_width,
		         vertices:    pth.points,
		         tangents:    pth.tangents});
    }
    let lof = this._config.display_props.label_offset;
    lof = new THREE.Vector3(lof[0], lof[1], lof[2]);
    for(let i = 0; i < this._config.landmarks.length; ++i) {
      let lmk = this._config.landmarks[i];
      for(let j = 0; j < lmk.paths.length; ++j) {
	let lpi = this._config.pathIdToIdx[lmk.paths[j]];
	let pas = this._config.paths[lpi].points[lmk.position[j]];
	let pos = new THREE.Vector3(pas[0], pas[1], pas[2]);
	this._ren.addModel({name: this.getLandmarkName(lmk.id),
		           mode:  MARenderMode.MARKER,
		           position: pos});
	this._ren.addModel({name: this.getLandmarkLblName(lmk.id),
		           mode:  MARenderMode.LABEL,
		           text:  lmk.anatomy[0].abbreviated_name,
		           position: pos.add(lof)});
      }
    }
  }

  /**
   * @class	GCA3DRenderer
   * @function	setView
   * @brief	Sets the renderers vieweing parameters.
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
  setView() {
    let dsp = this._config.display_props;
    let v = dsp.model_views[dsp.viewTypeToIdx[dsp.default_view]];
    let c = new THREE.Vector3(v.centre[0], v.centre[1], v.centre[2]);
    let p = new THREE.Vector3(v.cam_pos[0], v.cam_pos[1], v.cam_pos[2]);
    let u  = new THREE.Vector3(v.up[0],  v.up[1],  v.up[2]);
    this._ren.setCamera(c, v.near, v.far, p);
    this._ren.setHome(p, u);
    this._ren.goHome();
  }

  /**
   * @class	GCA3DRenderer
   * @function	addMarker
   * @brief	Adds a marker (with an optional text label).
   * @param	name		Reference name string for the marker.
   * @param	pos		Position of the marker as an array [x,y,z].
   * @param	col		Colour of the marker.
   * @param	txt		Optional text for label.
   */
  addMarker(name, pos, col, txt) {
    pos = new THREE.Vector3(pos[0], pos[1], pos[2]);
    this._ren.addModel({name: this.getMarkerName(name),
                        mode:  MARenderMode.MARKER,
		        color: col,
                        position: pos});
    if(txt) {
      let dp = this._config.display_props;
      let lof = new THREE.Vector3(dp.label_offset[0], dp.label_offset[1],
                                  dp.label_offset[2]);
      this._ren.addModel({name: this.getMarkerLblName(name),
                          mode:  MARenderMode.LABEL,
                          text:  txt,
                          position: pos.add(lof)});
    }
  }

  /**
   * @class	GCA3DRenderer
   * @function  removeMarker
   * @brief	Removes the marker (and it's optional text label) with the
   * 		given reference name.
   * @param	Reference name string of the marker.
   */
  removeMarker(name) {
    this._ren.removeModel(this.getMarkerName(name));
    this._ren.removeModel(this.getMarkerLblName(name));
  }

  /**
   * @class     GCA3DRenderer
   * @function  mapIntervalToMidline
   * @return    An array with the path, midline start and end index of the
   *            form [<gca path id>, <start index>, <end index>]
   *            or undefined if the intervals are invalid.
   * @brief     Maps an interval to a range of indices along a path. The
   *            range is:
   *              index(lmk0) + floor(f0 * (index(lmk1) - index(lmk0)),
   *              index(lmk2) + floor(f1 * (index(lmk3) - index(lmk2))
   *            where index(lmk) is the path index of landmark lmk.
   *            If any of the landmarks are not defined for the model
   *            then undefined will be returned.
   * @param     lmk0    First landmark used to define start point.
   * @param     lmk1    Second landmark used to define start point.
   * @param     f0      Fraction from lmk0 to lmk1 of start point.
   * @param     lmk2    First landmark used to define end point.
   * @param     lmk3    Second landmark used to define end point.
   * @param     f1      Fraction from lmk2 to lmk3 of end point.
   */
  mapIntervalToMidline(lmk0, lmk1, f0, lmk2, lmk3, f1) {
    let pse = undefined;
    let lmk = [lmk0, lmk1, lmk2, lmk3];
    let lmp = Array(4);
    let l0;
    for(let i = 0; i < 4; ++i) {
      let l1 = this.landmarkFromAnatID(lmk[i]);
      if(typeof l1 !== 'undefined') {
        lmp[i] = l1.position;
        if((i > 0) && (l0.paths[0] !== l1.paths[0])) {
          lmp = undefined;
        }
      } else {
        lmp = undefined;
        break;
      }
      if(typeof lmp === 'undefined') {
        break;
      }
      l0 = l1;
    }
    if(typeof lmp !== 'undefined') {
      pse = [l0.paths[0],
             Number(lmp[0]) + Math.floor(f0 * (lmp[1] - lmp[0])),
             Number(lmp[2]) + Math.floor(f1 * (lmp[3] - lmp[2]))];
    }
    return(pse);
  }

  /**
   * @class     GCA3DRenderer
   * @function  landmarkFromAnatID
   * @return    landmark config or undefined if not found
   * @brief     Given a landmark's GCA anatomy id returns te given landmark.
   * @param     id      Required landmark's GCA anatomy id
   */
  landmarkFromAnatID(id) {
    var lmk = undefined;
    let lmks = this._config.landmarks;
    for(let li = 0; li < lmks.length; ++li) {
      let l = lmks[li];
      if(l.anatomy[0].id === id) {
        lmk = l;
        break;
      }
    }
    return(lmk);
  }

  /**
   * @class	GCA3DRenderer
   * @function	addTrack
   * @brief	Adds a track (line parallel to a midline path).
   * @param	name		Reference name string for the track.
   * @param	path_id		Midline path id.
   * @param	start_idx	Index along the path at which the track starts.
   * @param	end_idx		Index along the path at which the track ends.
   * @param	col		Colour for the track.
   * @param	dist		Distance from the midline for the track.
   * @param	ang		Angle for the track with respect to the
   * 				midline's reference normal in radians.
   */
  addTrack(name, path_id, start_idx, end_idx, col, dist, ang) {
    let path = undefined;
    let path_idx = this._config.pathIdToIdx[path_id];
    if(path_idx !== undefined) {
      path = this._config.paths[path_idx];
      if(start_idx > end_idx) {
        let i = start_idx;
	start_idx = end_idx;
	end_idx = i;
      }
      if(start_idx < 0) {
        start_idx = 0;
      }
      if(end_idx >= path.n) {
        end_idx = path.n - 1;
      }
      let pts = [];
      let tgt = [];
      var cad = Math.cos(ang) * dist;
      var sad = Math.sin(ang) * dist;
      for(let i = start_idx; i <= end_idx; ++i) {
        let pp = path.points[i];
        let pr = path.normals[i];
        let pt = path.tangents[i];
	let ps = [(pt[1] * pr[2]) - (pr[1] * pt[2]),
	          (pt[2] * pr[0]) - (pr[2] * pt[0]),
		  (pt[0] * pr[1]) - (pr[0] * pt[1])];
	pts.push([pp[0] + (cad * pr[0] + sad * ps[0]),
	          pp[1] + (cad * pr[1] + sad * ps[1]),
		  pp[2] + (cad * pr[2] + sad * ps[2])]);
	tgt.push([pt[0], pt[1], pt[2]]);
      }
      let m_name = this.getTrackName(name);
      let dsp = path.display_props;
      this._ren.addModel({name: m_name,
	      mode:		MARenderMode.PATH,
	      color:		col,
	      linewidth:	dsp.line_width,
	      vertices:	pts,
	      tangents:	tgt});
    }
  }

  /**
   * @class	GCA3DRenderer
   * @function  removeTrack
   * @brief	Removes the track with the given reference name.
   * @param	name		Reference name string of the track.
   */
  removeTrack(name) {
    this._ren.removeModel(this.getTrackName(name));
  }

  /**
   * @class	GCA3DRenderer
   * @function	setPosition
   * @brief	Sets the current position along the colon. This is defined
   * 		by a proportion from the first to the second given landmark.
   * 		The position of the ROI is similarly defined using it's
   * 		start and end points.
   * @param	pmk0		Index of the first current position landmark.
   * @param	pmk1		Index of the second current position landmark.
   * @param	pdt		Proportional distance from the first landmark
   * 				to the second for the current position.
   * @param	smk0		Index of the first start of ROI landmark.
   * @param	smk1		Index of the second start of ROI landmark.
   * @param	sdt		Proportional distance from the first start of
   * 				ROI landmark to the second.
   * @param	emk0		Index of the first end of ROI landmark.
   * @param	emk1		Index of the second end of ROI landmark.
   * @param	edt		Proportional distance from the first end of
   * 				ROI landmark to the second.
   */
  setPosition(pmk0, pmk1, pdt, smk0, smk1, sdt, emk0, emk1, edt) {
    let p = this._indexOnPath(pmk0, pmk1, pdt);
    let rs = this._indexOnPath(smk0, smk1, sdt);
    let re = this._indexOnPath(emk0, emk1, edt);
    this._updatePosition(p[0], p[1], rs[1], re[1]);
  }

  /**
   * @class	GCA3DRenderer
   * @function	setDiscRadius
   * @brief	Sets the disc radius.
   * @param	rad		New disc radius.
   */
  setDiscRadius(rad) {
    let dsc = this._config.disc;
    let dsp = dsc.display_props;
    dsp.radius = rad;
    let pd = this._config.paths[this._curPath];
    let vtx = pd.points[this._curPathIdx];
    let tan = pd.tangents[this._curPathIdx];
    let ext = dsp.thickness;
    if(!Boolean(ext)) {
      ext = 1.0;
    }
    this._ren.updateModel({name: this.getDiscName(dsc.id),
	size: rad,
	position: new THREE.Vector3(vtx[0], vtx[1], vtx[2]),
	normal: new THREE.Vector3(tan[0], tan[1], tan[2]),
	extrude: ext});
  }

  /**
   * @class	GCA3DRenderer
   * @function  animate
   * @brief	Makes render live.
   */
  animate() {
    this._ren.animate();
  }

  /**
   * @class	GCA3DRenderer
   * @function	getPosition
   * @return	An array [pmk0, pmk1, pdt] with
   *              - pmk0 - Index of the lower landmark enclosing the given
   *                       path index.
   *              - pmk1 - Index of the upper landmark enclosing the given
   *                       path index.
   *              - pdt -  Proportional distance from the first landmark
   *                       to the second.
   * 		or undefined if the enclosing landmarks can not be found.
   * @brief	Finds the landmarks either side of the given path index
   * 		for the given path along with the proportional distance from
   * 		the first landmark to the second.
   * @param path		The path.
   * @param path_idx		Index along the path.
   */
  getPosition(path, path_idx) {
    let rtn = undefined;
    let landmarks = this._config.landmarks;
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

  /**
   * @class	GCA3DRenderer
   * @function	getSectionImage
   * @return	URL of the section image.
   * @brief	Computes section image URL at the current position.
   */
  getSectionImage() {
    let img = undefined;
    if(Boolean(this._config.section_files) &&
       (this._config.section_files.length > this._curPath)) {
      let sf = this._config.section_files[this._curPath];
      let template = sf.filename;
      let rx = /%([0 ]?)(\d*)d/;
      let fmt = template.match(rx);
      let n = parseInt(fmt[2]) || 0;
      let d = String(this._curPathIdx);
      if(n > d.length) {
	d = fmt[1].repeat(n - d.length) + d;
      }
      img = this._config.model_dir +
          sf.filepath + '/' + template.replace(rx, d);
    }
    return(img);
  }

  /**
   * @class	GCA3DRenderer
   * @function  positionToPath
   * @return    [<path>, <index>, <dsiatance>] or undefined
   * @brief	Finds a path which intersects the given position and then
   * 		returns the path and path index. If a path does not pass
   * 		within the tolerance distance from the position then
   * 		undefined is returned.
   * @param	pos		Position coordinate array ([x, y, z]).
   * @param	tol		Tolerance distance.
   */
  positionToPath(pos, tol) {
    let fnd = [0, 0, Number.MAX_VALUE];
    let pv = new THREE.Vector3(pos[0], pos[1], pos[2]);
    for(let pi = 0; pi < this._config.paths.length; ++pi) {
      let path = this._config.paths[pi];
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

  /**
   * @class	GCA3DRenderer
   * @function	getAnatomyConfig
   * @return	Anatomy config or undefined if the id is not valid.
   * @brief	Gets the anatomy configutation given an anatomy id.
   * @param	id		GCA anatomy id.
  */
  getAnatomyConfig(id) {
    let an = undefined;
    let all_an = this._config.anatomy_surfaces;
    for(let i = 0; i <  all_an.length; ++i) {
      if(all_an[i].id === id) {
        an = all_an[i];
	break;
      }
    }
    return(an);
  }

  /**
   * @class	GCA3DRenderer
   * @function	getReferenceName
   * @return	Reference object name. Can be used to find/update reference
   * 		object.
   */
  getReferenceName() {
    let name = this.referenceNamePrefix + this.nameSep +
               this._config.reference_surfaces.id;
    return(name);
  }

  /**
   * @class	GCA3DRenderer
   * @function	getAnatomyName
   * @return	Anatomy object name. Can be used to find/update anatomy
   * 		object.
   * @param	id		GCA anatomy id.
   */
  getAnatomyName(id) {
    let name = this.anatomyNamePrefix + this.nameSep + id;
    return(name);
  }

  /**
   * @class	GCA3DRenderer
   * @function	getDiscName
   * @return	Disc object name. Can be used to find/update disc
   * 		object.
   * @param	id		GCA anatomy id.
   */
  getDiscName(id) {
    let name = this.discNamePrefix + this.nameSep + id;
    return(name);
  }

  /**
   * @class	GCA3DRenderer
   * @function	getPathName
   * @return	Path object name. Can be used to find/update path
   * 		object.
   * @param	id		GCA path id.
   */
  getPathName(id) {
    let pix = this._config.pathIdToIdx[id];
    let name = this.pathNamePrefix + this.nameSep + pix;
    return(name);
  }

  /**
   * @class	GCA3DRenderer
   * @function	getLandmarkName
   * @return	Landmark object name. Can be used to find/update landmark
   * 		object.
   * @param	id		GCA landmark id.
   */
  getLandmarkName(id) {
    let name = this.landmarkNamePrefix + this.nameSep + id;
    return(name);
  }

  /**
   * @class	GCA3DRenderer
   * @function	getLandmarkLblName
   * @return	Landmark label object name. Can be used to find/update landmark
   * 		label object.
   * @param	id		GCA landmark id.
   */
  getLandmarkLblName(id) {
    let name = this.landmarkNameLblPrefix + this.nameSep + id;
    return(name);
  }

  /**
   * @class	GCA3DRenderer
   * @function	getMarkerName
   * @return	Marker object name. Can be used to find/update marker
   * 		object.
   * @param	id		Marker id.
   */
  getMarkerName(id) {
    let name = this.markerNamePrefix + this.nameSep + id;
    return(name);
  }

  /**
   * @class	GCA3DRenderer
   * @function	getMarkerLblName
   * @return	Marker label object name. Can be used to find/update marker
   * 		label object.
   * @param	id		GCA marker id.
   */
  getMarkerLblName(id) {
    let name = this.markerNameLblPrefix + this.nameSep + id;
    return(name);
  }

  /**
   * @class	GCA3DRenderer
   * @function	getTrackName
   * @return	Track object name. Can be used to find/update track object.
   * @param	id		Track id.
   */
  getTrackName(id) {
    let name = this.trackNamePrefix + this.nameSep + id;
    return(name);
  }

  /**
   * @class	GCA3DRenderer
   * @function  findDispObj
   * @return    Array of display group and display object or array with
   *            display object undefined if not found.
   * @brief     Finds the first display object which has the same GCA group
   *            and GCA id. If the GCA id is undefined then the first
   *            object with matching GCA group is found.
   * @param     gca_grp GCA group of the object.
   * @param     gca_id  GCA id of the object.
   */
  findDispObj(gca_grp, gca_id) {
    return(this._findDispObjs(gca_grp, gca_id, false));
  }

  /**
   * @class	GCA3DRenderer
   * @function  findAllDispObj
   * @return    Array of arrays, with each inner array being the display
   *            group and display object found. If no matching objects are
   *            found then an empty array is returned.
   * @brief     Finds all display objects which have the same GCA group
   *            and / or GCA id. If the GCA group is undefined then all
   *            groups are searched, similarly if the GCA id is undefined
   *            then all objects within the group(s) are found.
   * @param     gca_grp GCA group of the object.
   * @param     gca_id  GCA id of the object.
   */
  findAllDispObj(gca_grp, gca_id) {
    return(this._findDispObjs(gca_grp, gca_id, true));
  }

  /* Support function below here. */

  /**
   * @class	GCA3DRenderer
   * @function  _isDefined
   * @return    True of false.
   * @brief     Test is given parameter is defined.
   * @param     obj                     Given parameter.
   */
  _isDefined(x) {
    return(typeof x !== 'undefined');
  }

  /**
   * @class	GCA3DRenderer
   * @function  _isArray
   * @return	True of false;
   * @brief	Convinient test for object being an array.
   */
  _isArray(obj) {
    return(Object.prototype.toString.call(obj) === '[object Array]');
  }

  /**
   * @class	GCA3DRenderer
   * @function  _isString
   * @return	True of false;
   * @brief	Convinient test for object being a string.
   */
  _isString(obj) {
    return(Object.prototype.toString.call(obj) === '[object String]');
  }

  /**
   * @class	GCA3DRenderer
   * @function	_clamp
   * @return	Clamped vlue.
   * @brief	Clamps the given value to given range.
   * @param	v		Given value.
   * @param	mn		Minimum value of range.
   * @param	mx		Maximum value of range.
   */
  _clamp(v, mn, mx) {
    return(v < mn? mn: v > mx ? mx: v);
  }

  /**
   * @class	GCA3DRenderer
   * @function	_baryCoords
   * @return	Barycentric coordinates of the given point.
   * @brief	Computes the barycentric coordinates of the given point.
   * @param	t		Array of the triangle vertex positions.
   * @param	p		Point in triangle.
   */
  _baryCoords(t, p) {
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

  /**
   * @class	GCA3DRenderer
   * @function	_loadJson
   * @return	Object loaded.
   * @brief	Loads the JSON file at the given URL.
   * @param	url		URL of the JSON file.
   */
  _loadJson(url) {
    let obj = undefined;
    let req = new XMLHttpRequest();
    req.open('GET', url, false);
    req.overrideMimeType("text/html");
    req.send(null);
    if(req.status === 200) {
      obj = JSON.parse(req.responseText);
    }
    return(obj);
  }

  /**
   * @class	GCA3DRenderer
   * @function	_setConfig
   * @brief	Sets renderer configuration.
   * @param	Given cfg	configuration.
   */
  _setConfig(cfg) {
    this._config = cfg;
    if(!(this._config.model_dir)) {
      this._config['model_dir'] = '';
    }
    this._sortCfgLandmarks(cfg);
    this._findCfgPaths();
    this._findCfgModelObjects();
    this._findCfgViews();
    this._ren.markerSizeSet(this._config.display_props.marker_size);
  }

  /**
   * @class	GCA3DRenderer
   * @function	_loadPaths
   * @brief	Loads the path data into the config using the URLs in
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
  _loadPaths() {
    for(let i = 0, l = this._config.paths.length; i < l; ++i) {
      let path = this._config.paths[i];
      let path_data = this._loadJson(this._config.model_dir + 
                                     path.filepath + '/' +
                                     path.spline_filename);
      path["n"] = path_data.n;
      path["points"] = path_data.points;
      path["tangents"] = path_data.tangents;
      if(path_data.normals !== undefined) {
        path["normals"] = path_data.normals;
      }
    }
  }

  /**
   *
   * @class	GCA3DRenderer
   * @function	_sortCfgLandmarks
   * @brief	Sorts the landmarks in place) in the given configuration.
   *  		This is done to ensure that landmarks are ordered by their
   * 		position along (combined) paths.
   */
  _sortCfgLandmarks(cfg) {
    cfg.landmarks.sort((a, b) => {
      let cmp = a.position[0] - b.position[0];
      return(cmp);
    });
  }

  /**
   * @class	GCA3DRenderer
   * @function  _findCfgModelObjects
   * @brief     Finds model objects and sets easily accessed entries
   * 		in the config:
   * 		  config.display_props     <- GLOBAL_DISPLAY_PROP
   * 		  config.disc              <- DISC
   * 		  config.reference_surfaces <- REFERENCE_SURFACES
   * 		  config.anatomy_surfaces  <- [ANATOMY_SURFACES]
   *            easily accessed in the config.
   */
  _findCfgModelObjects() {
    let cfg = this._config;
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
	    if(!this._isDefined(cfg.reference_surfaces)) {
	      cfg.reference_surfaces = [];
	    }
	    cfg.reference_surfaces.push(mo);
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

  /**
   * @class	GCA3DRenderer
   * @function	_findCfgPaths
   * @brief	Build a look up table from path ids to path indices.
   */
  _findCfgPaths() {
    this._config['pathIdToIdx'] = [];
    for(let i = 0; i < this._config.paths.length; ++i) {
      let p = this._config.paths[i];
      this._config.pathIdToIdx[p.id] = i;
    }
  }

  /**
   * @class	GCA3DRenderer
   * @function	_findCfgViews
   * @brief	Build a look up table from view types to view indices.
   */
  _findCfgViews() {
    let gdp = this._config.display_props;
    gdp['viewTypeToIdx'] = [];
    for(const i in gdp.model_views) {
      let v = gdp.model_views[i];
      gdp.viewTypeToIdx[v.type] = i;
    }
  }

  /**
   * @class	GCA3DRenderer
   * @function	_indexOnPath
   * @return	Array of path index and position index along the path.
   * @brief	Finds the index on a path which is dst fraction from the
   * 		landmark lmn0 toward landmark lmn1. Both landmarks must
   * 		be on the same path.
   * @param	lmid0		First landmark id.
   * @param	lmid1		Second landmark id.
   * @param	dst		Proportional distance.
   */
  _indexOnPath(lmid0, lmid1, dst) {
    let path = undefined;
    let path_idx = undefined;
    let index = undefined;
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
      while((path_idx === undefined) && li < ll) {
	let ji = 0;
	for(let ji = 0; ji < jl; ++ji) {
	  if(mp[0][li] === mp[1][ji]) {
	    mpi[0] = li;
	    mpi[1] = ji;
	    path = mp[0][li];
	    path_idx = this._config.pathIdToIdx[path];
	  }
	}
        ++li;
      }
      if(path_idx !== undefined) {
        let i0 = this._config.landmarks[mi[0]].position[mpi[0]];
        let i1 = this._config.landmarks[mi[1]].position[mpi[1]];
	index = i0 + Math.floor((i1 - i0) * dst);
	index = this._clamp(index, 0, this._config.paths[path_idx].n - 1);
      }
    }
    return([path_idx, index]);
  }

  /**
   * @class	GCA3DRenderer
   * @function	_updateColon
   * @brief	Updates the colon colour(s) and opacity.
   */
  _updateColon() {
    let scene = this._ren.scene;
    for(let i = 0, l = scene.children.length; i < l; ++i) {
      let child = scene.children[i];
      if(child.name.substring(0, 7) === 'anatomy') {
        let s = child.name.split('_');
	if(s.length > 1) {
	  let idx = parseInt(s[1]);
	  if((idx >= 0) && (idx < this._config.anatomy_surfaces.length)) {
	    let anat = this._config.anatomy_surfaces[idx];
	    this._ren.updateModel({name: child.name,
				   color: anat.color,
				   opacity: anat.opacity});
	  }
        }
      }
    }
  }

  /**
   * @class	GCA3DRenderer
   * @function	_updatePosition
   * @brief	Update the rendering for a new current path position or
   * 		new highlighted ROI.
   * @param	path		Index of path for current position.
   * @param	pathIdx		Index of position on path for current position.
   * @param	roiIdxSrt	Index of position on path for start of ROI.
   * @param	roiIdxEnd	Index of position on path for end of ROI.
   */
  _updatePosition(path, pathIdx, roiIdxSrt, roiIdxEnd) {
    this._curPath = path;
    this._curPathIdx = pathIdx;
    this._roiIdx = [roiIdxSrt, roiIdxEnd];
    //
    let pd = this._config.paths[this._curPath];
    // Update disc
    let dsc = this._config.disc;
    let dsp = dsc.display_props;
    let name = this.getDiscName(dsc.id);
    let vtx = pd.points[this._curPathIdx];
    let tan = pd.tangents[this._curPathIdx];
    let ext = dsp.thickness;
    if(!Boolean(ext)) {
      ext = 1.0;
    }
    this._ren.updateModel({name: name,
	size: dsp.radius,
	position: new THREE.Vector3(vtx[0], vtx[1], vtx[2]),
	normal: new THREE.Vector3(tan[0], tan[1], tan[2]),
	extrude: ext});
    // Update highlight
    name = 'highlight';
    let vertices = pd.points.slice(this._roiIdx[0], this._roiIdx[1]);
    let tangents = pd.tangents.slice(this._roiIdx[0], this._roiIdx[1]);
    if(this._ren.getObjectByName(name)) {
      this._ren.updateModel({name: name,
	  bloom: true,
	  vertices:   vertices,
	  tangents:   tangents});
    } else {
      this._ren.addModel({name: name,
	  mode:       MARenderMode.PATH,
	  color:      this._config.display_props.path_highlight_color,
	  linewidth:  this._config.display_props.path_highlight_width,
	  vertices:   vertices,
	  tangents:   tangents});
    }
  }

  /**
   * @class	GCA3DRenderer
   * @function  _findDispObjs
   * @return    Array of display group and display object or array of arrays,
   * 		with each inner array being the display group and display
   * 		object found. If no matching objects are found then an empty
   * 		array is returned.
   * @brief     Finds either the first or all display objects which have the
   * 		same GCA group and / or GCA id. If the GCA group is undefined
   * 		then all groups are searched, similarly if the GCA id is
   * 		undefined then all objects within the group(s) are found.
   * @param     gca_grp GCA group of the object.
   * @param     gca_id  GCA id of the object.
   */
  _findDispObjs(gca_grp, gca_id, all) {
    let objs = [];
    let scene = this._ren.scene;
    for(let i = 0, l = scene.children.length; i < l; ++i) {
      let grp = undefined;
      let id = undefined;
      let obj = scene.children[i];
      let tynm = obj.name.split(this.nameSep);
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
	  case this.trackNamePrefix:
	    grp = 'TRACKS';
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
	    break;
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

  /**
   * @class	GCA3DRenderer
   * @function	_picker
   * @brief	Processes pick events before passing them on to the
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
  _picker(ev) {
    if(ev && ev.type && (ev.type === 'pick') && this._picker) {
      /* Find hit on path object nearest to centroid of hits, but
       * any hit on a landmark or marker will take priority. */
      let idx = {pth: -1, mkm: -1, ana: -1, trk: -1};
      let cnt = [];
      let objA = [];
      let typA = [];
      let namA = [];
      let posA = [];
      let triA = [];
      for(let i = 0, l = ev.hitlist.length; i < l; ++i) {
	let hit = ev.hitlist[i];
	let obj = hit.object;
	if(obj && obj.name) {
	  let tynm = obj.name.split(this.nameSep);
	  if(tynm.length > 1) {
	    if(tynm.length > 2) {
	      tynm = [tynm[0], tynm.slice(1).join(this.nameSep)];
	    }
	    if(tynm[0] === this.pathNamePrefix) {
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
	    } else if((tynm[0] === this.landmarkNamePrefix) ||
	              (tynm[0] === this.markerNamePrefix)) {
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
	    } else if(tynm[0] === this.trackNamePrefix) {
	      if(idx.trk < 0) {
	        idx.trk  = objA.length;
                cnt.push(1);
		objA.push(obj);
		typA.push(tynm[0]);
		namA.push(tynm[1]);
		posA.push(hit.point);
              }
	    } else if(tynm[0] === this.anatomyNamePrefix) {
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
	  if(typA[i] === this.anatomyNamePrefix) {
	    /* Map anatomy surface hit to path if possible. */
	    let g = objA[i].geometry;
	    let an = this.getAnatomyConfig(namA[i]);
	    if(this._isDefined(an) && this._isDefined(an.mapping) &&
	       this._isDefined(g.index)  &&
	       this._isDefined(g.attributes.position)){
	      let t = triA[i] * 3;
	      let ti = [g.index.array[t], g.index.array[t + 1],
	                g.index.array[t + 2]];
	      let p = g.attributes.position.array;
	      let tv = new Array(3);
	      let mp = new Array(3);
	      for(let j = 0; j < 3; ++j) {
		let v = ti[j] * 3;
		mp[j] = an.mapping[ti[i]];
	        tv[j] = new THREE.Vector3(p[v], p[v + 1], p[v + 2]);
	      }
	      // Do barycentric interpolation in triangle
	      let tw = this._baryCoords(tv, posA[i]);
	      let pi = Math.floor(mp[0] * tw[0] + 
	          mp[1] * tw[1] + mp[2] * tw[2]);
	      // Compute path coordinates
	      let path = this._config.paths[this._curPath];
	      pi = this._clamp(pi, 0, path.n - 1);
	      posA[i] = path.points[pi];
	    } else {
	      // Something wrong, eg no mapping for anatomy so flag for removal
	      objA[i] = undefined;
	    }
	  } else {
	    let p = posA[i].divideScalar(cnt[i]);
	    posA[i] = [p.x, p.y, p.z];
	  }
	}
	/* Remove and invalid hits, flagged but undefined object */
	for(let i = objA.length - 1; i >= 0; --i) {
	  if(!this._isDefined(objA[i])) {
            objA.splice(i, 1);
	    typA.splice(i, 1);
            namA.splice(i, 1);
	    posA.splice(i, 1);
	  }
	}
      }
      if(objA.length > 0) {
	this._pickerFn(ev, objA, typA, namA, posA);
      }
    }
  }
}

export {GCA3DRenderer};

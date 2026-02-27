/*
 * Vintage Marzipano Virtual Tour
 * All icons rendered via pure CSS — no image dependencies
 */
'use strict';

(function() {
  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  // Load admin overrides from localStorage (persists across sessions).
  (function() {
    try {
      var saved = localStorage.getItem('museum_tour_data');
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && parsed.scenes && parsed.scenes.length) {
          data = parsed;
        }
      }
    } catch(e) { /* ignore parse errors */ }
  })();

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');

  // Detect desktop or mobile mode.
  if (window.matchMedia) {
    var setMode = function() {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  // Build a per-scene view limiter function.
  function buildLimiter(faceSize, viewLimits) {
    return Marzipano.util.compose(
      Marzipano.RectilinearView.limit.traditional(
        faceSize, 100 * Math.PI / 180, 120 * Math.PI / 180),
      function(params) {
        // Per-scene FOV clamp
        if (params.fov < viewLimits.minFov) { params.fov = viewLimits.minFov; }
        if (params.fov > viewLimits.maxFov) { params.fov = viewLimits.maxFov; }
        // Per-scene pitch clamp
        var halfVfov = (params.fov || 0) / 2;
        var minPitch = -viewLimits.maxUpEdge + halfVfov;
        var maxPitch = viewLimits.maxDownEdge - halfVfov;
        if (minPitch > maxPitch) {
          minPitch = maxPitch = (viewLimits.maxDownEdge - viewLimits.maxUpEdge) / 2;
        }
        if (params.pitch < minPitch) { params.pitch = minPitch; }
        if (params.pitch > maxPitch) { params.pitch = maxPitch; }
        return params;
      }
    );
  }

  // Create scenes.
  var scenes = data.scenes.map(function(data) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    // Per-scene view limits with defaults.
    var vl = data.viewLimits || {};
    var sceneViewLimits = {
      maxUpEdge: (vl.maxUpEdge != null ? vl.maxUpEdge : 50) * Math.PI / 180,
      maxDownEdge: (vl.maxDownEdge != null ? vl.maxDownEdge : 50) * Math.PI / 180,
      minFov: (vl.minFov != null ? vl.minFov : 30) * Math.PI / 180,
      maxFov: (vl.maxFov != null ? vl.maxFov : 100) * Math.PI / 180
    };
    var limiter = buildLimiter(data.faceSize, sceneViewLimits);
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create link hotspots.
    data.linkHotspots.forEach(function(hotspot) {
      var element = createLinkHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, {
        yaw: hotspot.yaw,
        pitch: hotspot.pitch
      });
    });

    // Create info hotspots.
    data.infoHotspots.forEach(function(hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, {
        yaw: hotspot.yaw,
        pitch: hotspot.pitch
      });
    });

    // Create image hotspots (standalone images on panorama).
    (data.imageHotspots || []).forEach(function(hotspot) {
      var element = createImageHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, {
        yaw: hotspot.yaw,
        pitch: hotspot.pitch
      });
    });

    // Create nadir patch to hide tripod with soft blur.
    var nadirPatch = createNadirPatchElement();
    scene.hotspotContainer().createHotspot(nadirPatch, {
      yaw: 0,
      pitch: Math.PI / 2
    });

    return {
      data: data,
      scene: scene,
      view: view,
      viewLimits: sceneViewLimits,
      faceSize: data.faceSize
    };
  });

  // Set up autorotate, if enabled.
  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI / 2
  });

  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  // Set handler for autorotate toggle.
  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // Set up fullscreen mode, if supported.
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Set up view control buttons.
  if (data.settings.viewControlButtons) {
    document.body.classList.add('view-control-buttons');
  }

  // Set up multiple scenes toggle.
  if (scenes.length > 1) {
    document.body.classList.add('multiple-scenes');
  }

  // Set handler for scene list toggle.
  sceneListToggleElement.addEventListener('click', toggleSceneList);

  // Start with the scene list open on desktop.
  if (!document.body.classList.contains('mobile')) {
    showSceneList();
  }

  // Set handler for scene switch.
  scenes.forEach(function(scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    el.addEventListener('click', function() {
      switchScene(scene);
      // On mobile, hide scene list after selecting a scene.
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
  });

  // DOM elements for view controls.
  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  // Dynamic parameters for controls.
  var velocity = 0.7;
  var friction = 3;

  // Associate view controls with elements.
  var controls = viewer.controls();
  controls.registerMethod('upElement',
    new Marzipano.ElementPressControlMethod(viewUpElement, 'y', -velocity, friction), true);
  controls.registerMethod('downElement',
    new Marzipano.ElementPressControlMethod(viewDownElement, 'y', velocity, friction), true);
  controls.registerMethod('leftElement',
    new Marzipano.ElementPressControlMethod(viewLeftElement, 'x', -velocity, friction), true);
  controls.registerMethod('rightElement',
    new Marzipano.ElementPressControlMethod(viewRightElement, 'x', velocity, friction), true);
  controls.registerMethod('inElement',
    new Marzipano.ElementPressControlMethod(viewInElement, 'zoom', -velocity, friction), true);
  controls.registerMethod('outElement',
    new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom', velocity, friction), true);

  // Add click-based zoom as backup (ElementPressControlMethod requires hold).
  viewInElement.addEventListener('click', function() {
    var view = viewer.view();
    if (view) {
      var fov = view.fov();
      view.setFov(fov - 0.15);
    }
  });
  viewOutElement.addEventListener('click', function() {
    var view = viewer.view();
    if (view) {
      var fov = view.fov();
      view.setFov(fov + 0.15);
    }
  });

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  function switchScene(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    startAutorotate();
    updateSceneName(scene);
    updateSceneList(scene);
    if (window.TOUR) window.TOUR.currentScene = scene;
  }

  function updateSceneName(scene) {
    sceneNameElement.innerHTML = sanitize(scene.data.name);
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
    }
  }

  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) {
      return;
    }
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  function toggleAutorotate() {
    if (autorotateToggleElement.classList.contains('enabled')) {
      autorotateToggleElement.classList.remove('enabled');
      stopAutorotate();
    } else {
      autorotateToggleElement.classList.add('enabled');
      startAutorotate();
    }
  }

  // Create a link hotspot element using pure CSS icons (navigator-style chevron).
  function createLinkHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('link-hotspot');

    // Create CSS chevron icon element.
    var icon = document.createElement('div');
    icon.classList.add('link-hotspot-icon');

    // Set rotation transform for directional arrow.
    var transformProperties = ['-ms-transform', '-webkit-transform', 'transform'];
    for (var i = 0; i < transformProperties.length; i++) {
      var property = transformProperties[i];
      icon.style[property] = 'rotate(' + hotspot.rotation + 'rad)';
    }

    // Add click event handler.
    wrapper.addEventListener('click', function() {
      switchScene(findSceneById(hotspot.target));
    });

    // Prevent touch and scroll events from reaching the parent element.
    stopTouchAndScrollEventPropagation(wrapper);

    // Create visible label under arrow (always shown).
    var label = document.createElement('div');
    label.classList.add('link-hotspot-label');
    label.innerHTML = findSceneDataById(hotspot.target).name;

    // Create tooltip element (shown on hover).
    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip');
    tooltip.classList.add('link-hotspot-tooltip');
    tooltip.innerHTML = findSceneDataById(hotspot.target).name;

    wrapper.appendChild(icon);
    wrapper.appendChild(label);
    wrapper.appendChild(tooltip);

    return wrapper;
  }

  // Create an info hotspot element using pure CSS icons (museum-style button).
  function createInfoHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('info-hotspot');

    // Create hotspot/tooltip header.
    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');

    // Create CSS icon element with "i" letter.
    var iconWrapper = document.createElement('div');
    iconWrapper.classList.add('info-hotspot-icon-wrapper');
    var icon = document.createElement('div');
    icon.classList.add('info-hotspot-icon');
    icon.textContent = 'i';
    iconWrapper.appendChild(icon);

    // Create visible label "ПОДРОБНЕЕ" next to icon.
    var label = document.createElement('div');
    label.classList.add('info-hotspot-label');
    label.textContent = 'ПОДРОБНЕЕ';

    // Create title element.
    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');
    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    // Create CSS close element.
    var closeWrapper = document.createElement('div');
    closeWrapper.classList.add('info-hotspot-close-wrapper');
    var closeIcon = document.createElement('div');
    closeIcon.classList.add('info-hotspot-close-icon');
    closeWrapper.appendChild(closeIcon);

    // Construct header element.
    header.appendChild(iconWrapper);
    header.appendChild(label);
    header.appendChild(titleWrapper);
    header.appendChild(closeWrapper);

    // Create text element.
    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    text.innerHTML = hotspot.text;

    // Place header and text into wrapper element.
    wrapper.appendChild(header);
    wrapper.appendChild(text);

    // Build separate image panel if present (floats outside text block).
    var hasImage = hotspot.image && hotspot.image.url;
    var imgPos = hasImage ? (hotspot.image.position || 'right') : '';
    var imagePanel = null;

    if (hasImage) {
      wrapper.classList.add('has-img-' + imgPos);
      imagePanel = document.createElement('div');
      imagePanel.classList.add('info-hotspot-image-panel', 'img-panel-' + imgPos);

      var imgFrame = document.createElement('div');
      imgFrame.classList.add('info-hotspot-image-frame');

      var img = document.createElement('img');
      img.src = hotspot.image.url;
      img.alt = hotspot.image.caption || hotspot.title || '';
      imgFrame.appendChild(img);

      // Zoom overlay icon
      var zoomIcon = document.createElement('div');
      zoomIcon.classList.add('info-hotspot-image-zoom');
      imgFrame.appendChild(zoomIcon);

      imgFrame.addEventListener('click', function(e) {
        e.stopPropagation();
        openLightbox(hotspot.image.url, hotspot.image.caption || hotspot.title || '');
      });

      imagePanel.appendChild(imgFrame);

      if (hotspot.image.caption) {
        var cap = document.createElement('div');
        cap.classList.add('info-hotspot-image-caption');
        cap.textContent = hotspot.image.caption;
        imagePanel.appendChild(cap);
      }

      wrapper.appendChild(imagePanel);
    }

    // Create a modal for the hotspot content to appear on mobile mode.
    var modal = document.createElement('div');
    modal.innerHTML = wrapper.innerHTML;
    modal.classList.add('info-hotspot-modal');
    document.body.appendChild(modal);

    var toggle = function() {
      // Close all other open info hotspots first
      if (!wrapper.classList.contains('visible')) {
        document.querySelectorAll('.info-hotspot.visible').forEach(function(other) {
          if (other !== wrapper) other.classList.remove('visible');
        });
        document.querySelectorAll('.info-hotspot-modal.visible').forEach(function(m) {
          if (m !== modal) m.classList.remove('visible');
        });
      }
      wrapper.classList.toggle('visible');
      modal.classList.toggle('visible');
      // Position bottom image panel dynamically based on text height
      if (hasImage && imgPos === 'bottom' && wrapper.classList.contains('visible')) {
        requestAnimationFrame(function() {
          var bp = wrapper.querySelector('.img-panel-bottom');
          if (bp) {
            var th = text.scrollHeight || text.offsetHeight;
            bp.style.top = (50 + th) + 'px';
          }
        });
      }
    };

    // Show content when hotspot is clicked.
    wrapper.querySelector('.info-hotspot-header').addEventListener('click', toggle);

    // Hide content when close icon is clicked.
    modal.querySelector('.info-hotspot-close-wrapper').addEventListener('click', toggle);

    // Prevent touch and scroll events from reaching the parent element.
    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }

  // Create nadir patch element — uses backdrop-filter blur to naturally hide tripod.
  function createNadirPatchElement() {
    var wrapper = document.createElement('div');
    wrapper.classList.add('nadir-patch');
    var inner = document.createElement('div');
    inner.classList.add('nadir-patch-inner');
    wrapper.appendChild(inner);
    stopTouchAndScrollEventPropagation(wrapper);
    return wrapper;
  }

  // Open a fullscreen lightbox for an image.
  function openLightbox(url, caption) {
    var existing = document.querySelector('.image-lightbox');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.classList.add('image-lightbox');

    var closeBtn = document.createElement('div');
    closeBtn.classList.add('image-lightbox-close');
    overlay.appendChild(closeBtn);

    var img = document.createElement('img');
    img.src = url;
    overlay.appendChild(img);

    if (caption) {
      var cap = document.createElement('div');
      cap.classList.add('image-lightbox-caption');
      cap.textContent = caption;
      overlay.appendChild(cap);
    }

    function closeLb() { overlay.classList.remove('visible'); setTimeout(function() { overlay.remove(); }, 350); }
    closeBtn.addEventListener('click', function(e) { e.stopPropagation(); closeLb(); });
    overlay.addEventListener('click', closeLb);
    img.addEventListener('click', function(e) { e.stopPropagation(); });

    document.body.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('visible'); });
  }

  // Create a standalone image hotspot (thumbnail on panorama, lightbox on click).
  function createImageHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('image-hotspot');

    var inner = document.createElement('div');
    inner.classList.add('image-hotspot-inner');

    var img = document.createElement('img');
    img.src = hotspot.url;
    img.alt = hotspot.caption || '';
    inner.appendChild(img);

    if (hotspot.caption) {
      var cap = document.createElement('div');
      cap.classList.add('image-hotspot-caption');
      cap.textContent = hotspot.caption;
      inner.appendChild(cap);
    }

    wrapper.appendChild(inner);

    wrapper.addEventListener('click', function() {
      openLightbox(hotspot.url, hotspot.caption || '');
    });

    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }

  // Prevent touch and scroll events from reaching the parent element.
  function stopTouchAndScrollEventPropagation(element, eventList) {
    var eventList = ['touchstart', 'touchmove', 'touchend', 'touchcancel',
                     'wheel', 'mousewheel'];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function(event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  // If data came from localStorage, update scene list names.
  if (data !== window.APP_DATA) {
    data.scenes.forEach(function(sceneData) {
      var el = document.querySelector('#sceneList .scene[data-id="' + sceneData.id + '"] .text');
      if (el) el.textContent = sceneData.name;
    });
  }

  // Update view limits at runtime (called by admin panel).
  function updateViewLimits(sceneId, limits) {
    var s = findSceneById(sceneId);
    if (!s) return;
    // Update the stored limits object (in radians).
    s.viewLimits.maxUpEdge = limits.maxUpEdge * Math.PI / 180;
    s.viewLimits.maxDownEdge = limits.maxDownEdge * Math.PI / 180;
    s.viewLimits.minFov = limits.minFov * Math.PI / 180;
    s.viewLimits.maxFov = limits.maxFov * Math.PI / 180;
    // Rebuild and replace the limiter on the view (forces Marzipano to re-evaluate).
    var newLimiter = buildLimiter(s.faceSize, s.viewLimits);
    s.view.setLimiter(newLimiter);
  }

  // Expose tour API for admin panel.
  window.TOUR = {
    viewer: viewer,
    scenes: scenes,
    appData: data,
    currentScene: null,
    switchScene: switchScene,
    findSceneById: findSceneById,
    findSceneDataById: findSceneDataById,
    createInfoHotspotElement: createInfoHotspotElement,
    createLinkHotspotElement: createLinkHotspotElement,
    createImageHotspotElement: createImageHotspotElement,
    openLightbox: openLightbox,
    updateViewLimits: updateViewLimits
  };

  // Display the initial scene.
  switchScene(scenes[0]);

})();

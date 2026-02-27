/*
 * Museum Tour Admin Panel
 * Inline editing with localStorage persistence + optional Firebase cloud sync.
 * Activate by adding ?admin to the URL.
 * Password: admin (change ADMIN_PASSWORD below).
 */
'use strict';

(function() {
  // ===== CONFIGURATION =====
  var ADMIN_PASSWORD = 'admin';
  var LS_DATA_KEY = 'museum_tour_data';
  var LS_FIREBASE_KEY = 'museum_firebase_config';
  var LS_IMGBB_KEY = 'museum_imgbb_apikey';

  // Only activate if ?admin is in URL
  if (location.search.indexOf('admin') === -1) return;

  // ===== STATE =====
  var mode = 'view';
  var adminData = null;
  var firebaseDB = null;
  var toolbar = null;
  var modeLabel = null;
  var activeModal = null;
  var clickStart = null;

  // Wait for TOUR API to be ready (exposed by index.js)
  var readyCheck = setInterval(function() {
    if (window.TOUR) {
      clearInterval(readyCheck);
      startAdmin();
    }
  }, 100);

  function startAdmin() {
    var pwd = prompt('Пароль администратора:');
    if (pwd !== ADMIN_PASSWORD) {
      alert('Неверный пароль');
      return;
    }

    document.body.classList.add('admin-mode');
    // Deep clone current data for editing
    adminData = JSON.parse(JSON.stringify(window.TOUR.appData));

    buildToolbar();
    setupClickHandlers();
    tryInitFirebase();
    notify('Админ-панель активирована');
  }

  // ========================================
  // ===== TOOLBAR
  // ========================================
  function buildToolbar() {
    toolbar = document.createElement('div');
    toolbar.id = 'adminToolbar';
    toolbar.innerHTML =
      '<div class="admin-toolbar-inner">' +
        '<span class="admin-logo">\u2699 \u0410\u0414\u041C\u0418\u041D</span>' +
        '<div class="admin-btns">' +
          mkBtn('mode-view', '\uD83D\uDC41', '\u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440', true) +
          mkBtn('mode-edit', '\u270F\uFE0F', '\u0420\u0435\u0434\u0430\u043A\u0442.') +
          mkBtn('mode-add-info', '\uD83D\uDCCC', '\u0418\u043D\u0444\u043E') +
          mkBtn('mode-add-link', '\uD83D\uDD17', '\u0421\u0441\u044B\u043B\u043A\u0430') +
          mkBtn('mode-add-image', '\uD83D\uDDBC', '\u041A\u0430\u0440\u0442\u0438\u043D\u043A\u0430') +
          '<span class="admin-sep"></span>' +
          mkBtn('save-view', '\uD83D\uDCF7', '\u0420\u0430\u043A\u0443\u0440\u0441') +
          mkBtn('edit-scenes', '\uD83D\uDCCB', '\u0421\u0446\u0435\u043D\u044B') +
          mkBtn('edit-limits', '\uD83D\uDCD0', '\u0423\u0433\u043B\u044B') +
          '<span class="admin-sep"></span>' +
          mkBtn('save', '\uD83D\uDCBE', '\u0421\u043E\u0445\u0440.') +
          mkBtn('export', '\uD83D\uDCE5', '\u042D\u043A\u0441\u043F\u043E\u0440\u0442') +
          mkBtn('firebase-cfg', '\uD83D\uDD25', 'Firebase') +
          mkBtn('imgbb-cfg', '\uD83C\uDF10', 'ImgBB') +
          mkBtn('reset', '\uD83D\uDD04', '\u0421\u0431\u0440\u043E\u0441') +
        '</div>' +
        '<div class="admin-mode-label">\u0420\u0435\u0436\u0438\u043C: <b>\u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440</b></div>' +
      '</div>';
    document.body.appendChild(toolbar);
    modeLabel = toolbar.querySelector('.admin-mode-label b');

    toolbar.addEventListener('click', function(e) {
      var b = e.target.closest('[data-action]');
      if (!b) return;
      onAction(b.getAttribute('data-action'));
    });
  }

  function mkBtn(action, icon, label, active) {
    return '<button class="admin-btn' + (active ? ' active' : '') +
      '" data-action="' + action + '">' + icon + ' ' + label + '</button>';
  }

  function onAction(action) {
    var modeActions = ['mode-view', 'mode-edit', 'mode-add-info', 'mode-add-link', 'mode-add-image'];
    switch (action) {
      case 'mode-view':      setMode('view'); break;
      case 'mode-edit':      setMode('edit'); break;
      case 'mode-add-info':  setMode('add-info'); break;
      case 'mode-add-link':  setMode('add-link'); break;
      case 'mode-add-image': setMode('add-image'); break;
      case 'save-view':     doSaveView(); break;
      case 'edit-scenes':   showScenesModal(); break;
      case 'edit-limits':   showViewLimitsModal(); break;
      case 'save':          doSave(); break;
      case 'export':        doExport(); break;
      case 'firebase-cfg':  showFirebaseModal(); break;
      case 'imgbb-cfg':    showImgBBModal(); break;
      case 'reset':         doReset(); break;
    }
    // Highlight active mode button
    if (modeActions.indexOf(action) !== -1) {
      toolbar.querySelectorAll('.admin-btn').forEach(function(b) {
        if (modeActions.indexOf(b.getAttribute('data-action')) !== -1) {
          b.classList.toggle('active', b.getAttribute('data-action') === action);
        }
      });
    }
  }

  function setMode(m) {
    mode = m;
    var labels = {
      'view':      '\u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440',
      'edit':      '\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 (\u043A\u043B\u0438\u043A\u043D\u0438\u0442\u0435 \u043D\u0430 \u0445\u043E\u0442\u0441\u043F\u043E\u0442)',
      'add-info':  '\u041A\u043B\u0438\u043A\u043D\u0438\u0442\u0435 \u043D\u0430 \u043F\u0430\u043D\u043E\u0440\u0430\u043C\u0443 \u0434\u043B\u044F \u043D\u043E\u0432\u043E\u0433\u043E \u0438\u043D\u0444\u043E-\u0445\u043E\u0442\u0441\u043F\u043E\u0442\u0430',
      'add-link':  '\u041A\u043B\u0438\u043A\u043D\u0438\u0442\u0435 \u043D\u0430 \u043F\u0430\u043D\u043E\u0440\u0430\u043C\u0443 \u0434\u043B\u044F \u043D\u043E\u0432\u043E\u0439 \u0441\u0441\u044B\u043B\u043A\u0438',
      'add-image': '\u041A\u043B\u0438\u043A\u043D\u0438\u0442\u0435 \u043D\u0430 \u043F\u0430\u043D\u043E\u0440\u0430\u043C\u0443 \u0434\u043B\u044F \u043D\u043E\u0432\u043E\u0439 \u043A\u0430\u0440\u0442\u0438\u043D\u043A\u0438'
    };
    modeLabel.textContent = labels[m] || m;
    document.body.className = document.body.className.replace(/\badmin-mode-\S+/g, '');
    document.body.classList.add('admin-mode-' + m);
  }

  // ========================================
  // ===== CLICK HANDLERS
  // ========================================
  function setupClickHandlers() {
    var pano = document.getElementById('pano');

    // Track mouse to distinguish click from drag
    pano.addEventListener('mousedown', function(e) {
      clickStart = { x: e.clientX, y: e.clientY, t: Date.now() };
    });

    // Panorama clicks for adding hotspots
    pano.addEventListener('click', function(e) {
      if (!clickStart) return;
      var dx = e.clientX - clickStart.x;
      var dy = e.clientY - clickStart.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10 || Date.now() - clickStart.t > 400) return;
      // Ignore clicks on existing hotspots and admin UI
      if (e.target.closest('.hotspot') || e.target.closest('#adminToolbar') ||
          e.target.closest('.admin-modal-overlay')) return;

      if (mode === 'add-info') {
        var coords = screenToCoords(e);
        if (coords) showAddInfoModal(coords);
      } else if (mode === 'add-link') {
        var coords = screenToCoords(e);
        if (coords) showAddLinkModal(coords);
      } else if (mode === 'add-image') {
        var coords = screenToCoords(e);
        if (coords) showAddImageModal(coords);
      }
    });

    // Intercept hotspot clicks in edit mode (capturing phase prevents normal handlers)
    document.addEventListener('click', function(e) {
      if (mode !== 'edit') return;

      var infoEl = e.target.closest('.info-hotspot');
      if (infoEl) {
        e.stopPropagation();
        e.preventDefault();
        showEditInfoModal(infoEl);
        return;
      }

      var imgEl = e.target.closest('.image-hotspot');
      if (imgEl) {
        e.stopPropagation();
        e.preventDefault();
        showEditImageModal(imgEl);
        return;
      }

      var linkEl = e.target.closest('.link-hotspot');
      if (linkEl) {
        e.stopPropagation();
        e.preventDefault();
        showEditLinkModal(linkEl);
        return;
      }
    }, true); // capturing phase
  }

  function screenToCoords(e) {
    var viewer = window.TOUR.viewer;
    var view = viewer.view();
    if (!view) return null;
    var rect = document.getElementById('pano').getBoundingClientRect();
    return view.screenToCoordinates({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  // ========================================
  // ===== SCENE HELPERS
  // ========================================
  function curSceneId() {
    return window.TOUR.currentScene ? window.TOUR.currentScene.data.id : null;
  }

  function sceneDataById(id) {
    for (var i = 0; i < adminData.scenes.length; i++) {
      if (adminData.scenes[i].id === id) return adminData.scenes[i];
    }
    return null;
  }

  function getHotspotContainer(sceneId) {
    var s = window.TOUR.findSceneById(sceneId);
    return s ? s.scene.hotspotContainer() : null;
  }

  function findHotspotObj(container, el) {
    if (!container) return null;
    var list = container.listHotspots();
    for (var i = 0; i < list.length; i++) {
      var dom = list[i].domElement();
      if (dom === el || dom.contains(el) || el.contains(dom)) return list[i];
    }
    return null;
  }

  function findDataIndex(arr, yaw, pitch) {
    for (var i = 0; i < arr.length; i++) {
      if (Math.abs(arr[i].yaw - yaw) < 0.005 && Math.abs(arr[i].pitch - pitch) < 0.005) {
        return i;
      }
    }
    return -1;
  }

  // ========================================
  // ===== MODAL SYSTEM
  // ========================================
  function createModal(title, content, buttons) {
    closeModal();

    var overlay = document.createElement('div');
    overlay.className = 'admin-modal-overlay';

    var modal = document.createElement('div');
    modal.className = 'admin-modal';
    modal.innerHTML =
      '<div class="admin-modal-header">' +
        '<h3>' + title + '</h3>' +
        '<button class="admin-modal-close">&times;</button>' +
      '</div>' +
      '<div class="admin-modal-body">' + content + '</div>' +
      '<div class="admin-modal-footer"></div>';

    var footer = modal.querySelector('.admin-modal-footer');
    buttons.forEach(function(btn) {
      var b = document.createElement('button');
      b.className = 'admin-modal-btn' + (btn.primary ? ' primary' : '') + (btn.danger ? ' danger' : '');
      b.textContent = btn.text;
      b.addEventListener('click', btn.onClick);
      footer.appendChild(b);
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    activeModal = overlay;

    modal.querySelector('.admin-modal-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeModal();
    });

    return modal;
  }

  function closeModal() {
    if (activeModal) {
      activeModal.remove();
      activeModal = null;
    }
  }

  // ========================================
  // ===== IMAGE UPLOAD (ImgBB)
  // ========================================
  function getImgBBKey() {
    return (localStorage.getItem(LS_IMGBB_KEY) || '').trim();
  }

  function uploadToImgBB(file, callback) {
    var apiKey = getImgBBKey();
    if (!apiKey) {
      alert('\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 API-\u043A\u043B\u044E\u0447 ImgBB (\u043A\u043D\u043E\u043F\u043A\u0430 \uD83C\uDF10 ImgBB \u0432 \u0442\u0443\u043B\u0431\u0430\u0440\u0435)');
      return;
    }
    var reader = new FileReader();
    reader.onload = function() {
      var base64 = reader.result.split(',')[1];
      var fd = new FormData();
      fd.append('key', apiKey);
      fd.append('image', base64);
      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://api.imgbb.com/1/upload');
      xhr.onload = function() {
        try {
          var resp = JSON.parse(xhr.responseText);
          if (resp.success) {
            callback(null, resp.data.url);
          } else {
            callback(resp.error ? resp.error.message : '\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438');
          }
        } catch(e) {
          callback('\u041E\u0448\u0438\u0431\u043A\u0430 \u043E\u0442\u0432\u0435\u0442\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430');
        }
      };
      xhr.onerror = function() { callback('\u0421\u0435\u0442\u0435\u0432\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430'); };
      xhr.send(fd);
    };
    reader.readAsDataURL(file);
  }

  // Returns HTML + wires up drag-drop/file-pick after modal is created.
  function buildUploadZoneHTML(inputId) {
    return '<div class="admin-upload-zone" id="uploadZone_' + inputId + '">' +
      '<div class="admin-upload-icon">\uD83D\uDCE4</div>' +
      '<div class="admin-upload-text">\u041F\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u0441\u044E\u0434\u0430</div>' +
      '<div class="admin-upload-or">\u0438\u043B\u0438</div>' +
      '<label class="admin-upload-btn">\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0444\u0430\u0439\u043B' +
        '<input type="file" accept="image/*" style="display:none" id="uploadFile_' + inputId + '">' +
      '</label>' +
      '<div class="admin-upload-status" id="uploadStatus_' + inputId + '"></div>' +
    '</div>';
  }

  function wireUploadZone(inputId) {
    var zone = document.getElementById('uploadZone_' + inputId);
    var fileInput = document.getElementById('uploadFile_' + inputId);
    var status = document.getElementById('uploadStatus_' + inputId);
    var urlInput = document.getElementById(inputId);
    if (!zone || !fileInput || !urlInput) return;

    function handleFile(file) {
      if (!file || !file.type.match(/^image\//)) {
        status.textContent = '\u042D\u0442\u043E \u043D\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435';
        status.className = 'admin-upload-status error';
        return;
      }
      if (file.size > 32 * 1024 * 1024) {
        status.textContent = '\u0424\u0430\u0439\u043B \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0439 (\u043C\u0430\u043A\u0441. 32MB)';
        status.className = 'admin-upload-status error';
        return;
      }
      status.textContent = '\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...';
      status.className = 'admin-upload-status loading';
      zone.classList.add('uploading');
      uploadToImgBB(file, function(err, url) {
        zone.classList.remove('uploading');
        if (err) {
          status.textContent = '\u041E\u0448\u0438\u0431\u043A\u0430: ' + err;
          status.className = 'admin-upload-status error';
        } else {
          urlInput.value = url;
          status.textContent = '\u2705 \u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E!';
          status.className = 'admin-upload-status success';
        }
      });
    }

    zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', function() { zone.classList.remove('dragover'); });
    zone.addEventListener('drop', function(e) {
      e.preventDefault();
      zone.classList.remove('dragover');
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
    fileInput.addEventListener('change', function() {
      if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
    });
  }

  // ========================================
  // ===== ADD INFO HOTSPOT
  // ========================================
  function showAddInfoModal(coords) {
    var content =
      '<label>\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A:</label>' +
      '<input type="text" id="adminInfoTitle" class="admin-input" placeholder="\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u044D\u043A\u0441\u043F\u043E\u043D\u0430\u0442\u0430">' +
      '<label>\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 (HTML \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C):</label>' +
      '<textarea id="adminInfoText" class="admin-textarea" rows="5" placeholder="\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435..."></textarea>' +
      '<hr class="admin-divider">' +
      '<label>\uD83D\uDDBC \u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 (URL, \u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E):</label>' +
      '<input type="text" id="adminInfoImgUrl" class="admin-input" placeholder="https://example.com/photo.jpg">' +
      buildUploadZoneHTML('adminInfoImgUrl') +
      '<label>\u041F\u043E\u0434\u043F\u0438\u0441\u044C \u043A \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044E:</label>' +
      '<input type="text" id="adminInfoImgCaption" class="admin-input" placeholder="\u041D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E">' +
      '<label>\u041F\u043E\u0437\u0438\u0446\u0438\u044F \u043F\u0430\u043D\u0435\u043B\u0438 \u0441 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435\u043C:</label>' +
      '<select id="adminInfoImgPos" class="admin-input">' +
        '<option value="right">\u0421\u043F\u0440\u0430\u0432\u0430 \u043E\u0442 \u0442\u0435\u043A\u0441\u0442\u0430</option>' +
        '<option value="left">\u0421\u043B\u0435\u0432\u0430 \u043E\u0442 \u0442\u0435\u043A\u0441\u0442\u0430</option>' +
        '<option value="top">\u0421\u0432\u0435\u0440\u0445\u0443 \u0442\u0435\u043A\u0441\u0442\u0430</option>' +
        '<option value="bottom">\u0421\u043D\u0438\u0437\u0443 \u0442\u0435\u043A\u0441\u0442\u0430</option>' +
      '</select>' +
      '<div class="admin-coords">yaw: ' + coords.yaw.toFixed(4) + '  pitch: ' + coords.pitch.toFixed(4) + '</div>';

    var modal = createModal('\u041D\u043E\u0432\u044B\u0439 \u0438\u043D\u0444\u043E-\u0445\u043E\u0442\u0441\u043F\u043E\u0442', content, [
      { text: '\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C', primary: true, onClick: function() {
        var title = document.getElementById('adminInfoTitle').value;
        var text = document.getElementById('adminInfoText').value;
        var imgUrl = document.getElementById('adminInfoImgUrl').value.trim();
        var imgCaption = document.getElementById('adminInfoImgCaption').value.trim();
        var imgPos = document.getElementById('adminInfoImgPos').value;
        if (!title) { alert('\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A'); return; }
        var image = imgUrl ? { url: imgUrl, caption: imgCaption, position: imgPos } : null;
        addInfoHotspot(coords.yaw, coords.pitch, title, text, image);
        closeModal();
        notify('\u0418\u043D\u0444\u043E-\u0445\u043E\u0442\u0441\u043F\u043E\u0442 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D');
      }},
      { text: '\u041E\u0442\u043C\u0435\u043D\u0430', onClick: closeModal }
    ]);
    wireUploadZone('adminInfoImgUrl');
  }

  function addInfoHotspot(yaw, pitch, title, text, image) {
    var sceneId = curSceneId();
    var sd = sceneDataById(sceneId);
    if (!sd) return;

    var hotspot = { yaw: yaw, pitch: pitch, title: title, text: text };
    if (image) hotspot.image = image;
    sd.infoHotspots.push(hotspot);

    // Add to live scene
    var container = getHotspotContainer(sceneId);
    if (container) {
      var el = window.TOUR.createInfoHotspotElement(hotspot);
      container.createHotspot(el, { yaw: yaw, pitch: pitch });
    }
    autoSave();
  }

  // ========================================
  // ===== ADD LINK HOTSPOT
  // ========================================
  function showAddLinkModal(coords) {
    var options = '';
    adminData.scenes.forEach(function(scene) {
      options += '<option value="' + scene.id + '">' + escapeHtml(scene.name) + '</option>';
    });

    var content =
      '<label>\u0426\u0435\u043B\u0435\u0432\u0430\u044F \u0441\u0446\u0435\u043D\u0430:</label>' +
      '<select id="adminLinkTarget" class="admin-input">' + options + '</select>' +
      '<label>\u041F\u043E\u0432\u043E\u0440\u043E\u0442 \u0441\u0442\u0440\u0435\u043B\u043A\u0438 (\u0440\u0430\u0434):</label>' +
      '<input type="number" id="adminLinkRotation" class="admin-input" value="0" step="0.1">' +
      '<div class="admin-coords">yaw: ' + coords.yaw.toFixed(4) + '  pitch: ' + coords.pitch.toFixed(4) + '</div>';

    createModal('\u041D\u043E\u0432\u0430\u044F \u0441\u0441\u044B\u043B\u043A\u0430', content, [
      { text: '\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C', primary: true, onClick: function() {
        var target = document.getElementById('adminLinkTarget').value;
        var rotation = parseFloat(document.getElementById('adminLinkRotation').value) || 0;
        addLinkHotspot(coords.yaw, coords.pitch, target, rotation);
        closeModal();
        notify('\u0421\u0441\u044B\u043B\u043A\u0430 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u0430');
      }},
      { text: '\u041E\u0442\u043C\u0435\u043D\u0430', onClick: closeModal }
    ]);
  }

  function addLinkHotspot(yaw, pitch, target, rotation) {
    var sceneId = curSceneId();
    var sd = sceneDataById(sceneId);
    if (!sd) return;

    var hotspot = { yaw: yaw, pitch: pitch, rotation: rotation, target: target };
    sd.linkHotspots.push(hotspot);

    var container = getHotspotContainer(sceneId);
    if (container) {
      var el = window.TOUR.createLinkHotspotElement(hotspot);
      container.createHotspot(el, { yaw: yaw, pitch: pitch });
    }
    autoSave();
  }

  // ========================================
  // ===== EDIT INFO HOTSPOT
  // ========================================
  function showEditInfoModal(element) {
    var sceneId = curSceneId();
    var sd = sceneDataById(sceneId);
    if (!sd) return;

    var container = getHotspotContainer(sceneId);
    var hotspotObj = findHotspotObj(container, element);
    var pos = hotspotObj ? hotspotObj.position() : null;

    // Find matching entry in adminData by position
    var dataIndex = pos ? findDataIndex(sd.infoHotspots, pos.yaw, pos.pitch) : -1;

    // Fallback: match by title
    if (dataIndex === -1) {
      var titleEl = element.querySelector('.info-hotspot-title');
      var titleText = titleEl ? titleEl.innerHTML : '';
      for (var i = 0; i < sd.infoHotspots.length; i++) {
        if (sd.infoHotspots[i].title === titleText) { dataIndex = i; break; }
      }
    }

    var hotspotData = dataIndex >= 0 ? sd.infoHotspots[dataIndex] : {
      title: (element.querySelector('.info-hotspot-title') || {}).innerHTML || '',
      text: (element.querySelector('.info-hotspot-text') || {}).innerHTML || ''
    };

    var existingImg = hotspotData.image || {};
    var content =
      '<label>\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A:</label>' +
      '<input type="text" id="adminInfoTitle" class="admin-input" value="' + escapeAttr(hotspotData.title) + '">' +
      '<label>\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 (HTML):</label>' +
      '<textarea id="adminInfoText" class="admin-textarea" rows="5">' + escapeHtml(hotspotData.text) + '</textarea>' +
      '<hr class="admin-divider">' +
      '<label>\uD83D\uDDBC \u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 (URL):</label>' +
      '<input type="text" id="adminInfoImgUrl" class="admin-input" value="' + escapeAttr(existingImg.url || '') + '">' +
      buildUploadZoneHTML('adminInfoImgUrl') +
      '<label>\u041F\u043E\u0434\u043F\u0438\u0441\u044C:</label>' +
      '<input type="text" id="adminInfoImgCaption" class="admin-input" value="' + escapeAttr(existingImg.caption || '') + '">' +
      '<label>\u041F\u043E\u0437\u0438\u0446\u0438\u044F:</label>' +
      '<select id="adminInfoImgPos" class="admin-input">' +
        '<option value="right"' + (existingImg.position === 'right' || !existingImg.position ? ' selected' : '') + '>\u0421\u043F\u0440\u0430\u0432\u0430</option>' +
        '<option value="left"' + (existingImg.position === 'left' ? ' selected' : '') + '>\u0421\u043B\u0435\u0432\u0430</option>' +
        '<option value="top"' + (existingImg.position === 'top' ? ' selected' : '') + '>\u0421\u0432\u0435\u0440\u0445\u0443</option>' +
        '<option value="bottom"' + (existingImg.position === 'bottom' ? ' selected' : '') + '>\u0421\u043D\u0438\u0437\u0443</option>' +
      '</select>';

    createModal('\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0438\u043D\u0444\u043E-\u0445\u043E\u0442\u0441\u043F\u043E\u0442', content, [
      { text: '\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C', primary: true, onClick: function() {
        var title = document.getElementById('adminInfoTitle').value;
        var text = document.getElementById('adminInfoText').value;
        var imgUrl = document.getElementById('adminInfoImgUrl').value.trim();
        var imgCaption = document.getElementById('adminInfoImgCaption').value.trim();
        var imgPos = document.getElementById('adminInfoImgPos').value;

        if (dataIndex >= 0) {
          sd.infoHotspots[dataIndex].title = title;
          sd.infoHotspots[dataIndex].text = text;
          if (imgUrl) {
            sd.infoHotspots[dataIndex].image = { url: imgUrl, caption: imgCaption, position: imgPos };
          } else {
            delete sd.infoHotspots[dataIndex].image;
          }
        }

        // Rebuild hotspot DOM (easier than selective update for image layout)
        if (hotspotObj && container) {
          var pos = hotspotObj.position();
          container.destroyHotspot(hotspotObj);
          var newData = dataIndex >= 0 ? sd.infoHotspots[dataIndex] : hotspotData;
          var el = window.TOUR.createInfoHotspotElement(newData);
          container.createHotspot(el, { yaw: pos.yaw, pitch: pos.pitch });
        }

        closeModal();
        autoSave();
        notify('\u0425\u043E\u0442\u0441\u043F\u043E\u0442 \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D');
      }},
      { text: '\u0423\u0434\u0430\u043B\u0438\u0442\u044C', danger: true, onClick: function() {
        if (confirm('\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u044D\u0442\u043E\u0442 \u0445\u043E\u0442\u0441\u043F\u043E\u0442?')) {
          if (dataIndex >= 0) sd.infoHotspots.splice(dataIndex, 1);
          if (hotspotObj && container) container.destroyHotspot(hotspotObj);
          closeModal();
          autoSave();
          notify('\u0425\u043E\u0442\u0441\u043F\u043E\u0442 \u0443\u0434\u0430\u043B\u0451\u043D');
        }
      }},
      { text: '\u041E\u0442\u043C\u0435\u043D\u0430', onClick: closeModal }
    ]);
    wireUploadZone('adminInfoImgUrl');
  }

  // ========================================
  // ===== EDIT LINK HOTSPOT
  // ========================================
  function showEditLinkModal(element) {
    var sceneId = curSceneId();
    var sd = sceneDataById(sceneId);
    if (!sd) return;

    var container = getHotspotContainer(sceneId);
    var hotspotObj = findHotspotObj(container, element);
    var pos = hotspotObj ? hotspotObj.position() : null;

    var dataIndex = pos ? findDataIndex(sd.linkHotspots, pos.yaw, pos.pitch) : -1;
    if (dataIndex === -1) return;

    var hotspotData = sd.linkHotspots[dataIndex];

    var options = '';
    adminData.scenes.forEach(function(scene) {
      var sel = scene.id === hotspotData.target ? ' selected' : '';
      options += '<option value="' + scene.id + '"' + sel + '>' + escapeHtml(scene.name) + '</option>';
    });

    var content =
      '<label>\u0426\u0435\u043B\u0435\u0432\u0430\u044F \u0441\u0446\u0435\u043D\u0430:</label>' +
      '<select id="adminLinkTarget" class="admin-input">' + options + '</select>' +
      '<label>\u041F\u043E\u0432\u043E\u0440\u043E\u0442 (\u0440\u0430\u0434):</label>' +
      '<input type="number" id="adminLinkRotation" class="admin-input" value="' + hotspotData.rotation + '" step="0.1">';

    createModal('\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0443', content, [
      { text: '\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C', primary: true, onClick: function() {
        var target = document.getElementById('adminLinkTarget').value;
        var rotation = parseFloat(document.getElementById('adminLinkRotation').value) || 0;

        sd.linkHotspots[dataIndex].target = target;
        sd.linkHotspots[dataIndex].rotation = rotation;

        closeModal();
        autoSave();
        notify('\u0421\u0441\u044B\u043B\u043A\u0430 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0430. \u041F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0434\u043B\u044F \u043E\u0442\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F.');
      }},
      { text: '\u0423\u0434\u0430\u043B\u0438\u0442\u044C', danger: true, onClick: function() {
        if (confirm('\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u044D\u0442\u0443 \u0441\u0441\u044B\u043B\u043A\u0443?')) {
          sd.linkHotspots.splice(dataIndex, 1);
          if (hotspotObj && container) container.destroyHotspot(hotspotObj);
          closeModal();
          autoSave();
          notify('\u0421\u0441\u044B\u043B\u043A\u0430 \u0443\u0434\u0430\u043B\u0435\u043D\u0430');
        }
      }},
      { text: '\u041E\u0442\u043C\u0435\u043D\u0430', onClick: closeModal }
    ]);
  }

  // ========================================
  // ===== ADD IMAGE HOTSPOT
  // ========================================
  function showAddImageModal(coords) {
    var content =
      '<label>\uD83D\uDDBC URL \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F:</label>' +
      '<input type="text" id="adminImgUrl" class="admin-input" placeholder="https://example.com/photo.jpg">' +
      buildUploadZoneHTML('adminImgUrl') +
      '<label>\u041F\u043E\u0434\u043F\u0438\u0441\u044C:</label>' +
      '<input type="text" id="adminImgCaption" class="admin-input" placeholder="\u041D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E">' +
      '<div class="admin-coords">yaw: ' + coords.yaw.toFixed(4) + '  pitch: ' + coords.pitch.toFixed(4) + '</div>';

    createModal('\u041D\u043E\u0432\u0430\u044F \u043A\u0430\u0440\u0442\u0438\u043D\u043A\u0430', content, [
      { text: '\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C', primary: true, onClick: function() {
        var url = document.getElementById('adminImgUrl').value.trim();
        var caption = document.getElementById('adminImgCaption').value.trim();
        if (!url) { alert('\u0412\u0432\u0435\u0434\u0438\u0442\u0435 URL \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F'); return; }
        addImageHotspot(coords.yaw, coords.pitch, url, caption);
        closeModal();
        notify('\u041A\u0430\u0440\u0442\u0438\u043D\u043A\u0430 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u0430');
      }},
      { text: '\u041E\u0442\u043C\u0435\u043D\u0430', onClick: closeModal }
    ]);
    wireUploadZone('adminImgUrl');
  }

  function addImageHotspot(yaw, pitch, url, caption) {
    var sceneId = curSceneId();
    var sd = sceneDataById(sceneId);
    if (!sd) return;

    if (!sd.imageHotspots) sd.imageHotspots = [];
    var hotspot = { yaw: yaw, pitch: pitch, url: url, caption: caption };
    sd.imageHotspots.push(hotspot);

    var container = getHotspotContainer(sceneId);
    if (container) {
      var el = window.TOUR.createImageHotspotElement(hotspot);
      container.createHotspot(el, { yaw: yaw, pitch: pitch });
    }
    autoSave();
  }

  // ========================================
  // ===== EDIT IMAGE HOTSPOT
  // ========================================
  function showEditImageModal(element) {
    var sceneId = curSceneId();
    var sd = sceneDataById(sceneId);
    if (!sd || !sd.imageHotspots) return;

    var container = getHotspotContainer(sceneId);
    var hotspotObj = findHotspotObj(container, element);
    var pos = hotspotObj ? hotspotObj.position() : null;

    var dataIndex = pos ? findDataIndex(sd.imageHotspots, pos.yaw, pos.pitch) : -1;
    if (dataIndex === -1) return;

    var hotspotData = sd.imageHotspots[dataIndex];

    var content =
      '<label>\uD83D\uDDBC URL \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F:</label>' +
      '<input type="text" id="adminImgUrl" class="admin-input" value="' + escapeAttr(hotspotData.url) + '">' +
      buildUploadZoneHTML('adminImgUrl') +
      '<label>\u041F\u043E\u0434\u043F\u0438\u0441\u044C:</label>' +
      '<input type="text" id="adminImgCaption" class="admin-input" value="' + escapeAttr(hotspotData.caption || '') + '">';

    createModal('\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043A\u0430\u0440\u0442\u0438\u043D\u043A\u0443', content, [
      { text: '\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C', primary: true, onClick: function() {
        var url = document.getElementById('adminImgUrl').value.trim();
        var caption = document.getElementById('adminImgCaption').value.trim();
        if (!url) { alert('\u0412\u0432\u0435\u0434\u0438\u0442\u0435 URL'); return; }

        sd.imageHotspots[dataIndex].url = url;
        sd.imageHotspots[dataIndex].caption = caption;

        // Rebuild hotspot DOM
        if (hotspotObj && container) {
          var oldPos = hotspotObj.position();
          container.destroyHotspot(hotspotObj);
          var el = window.TOUR.createImageHotspotElement(sd.imageHotspots[dataIndex]);
          container.createHotspot(el, { yaw: oldPos.yaw, pitch: oldPos.pitch });
        }

        closeModal();
        autoSave();
        notify('\u041A\u0430\u0440\u0442\u0438\u043D\u043A\u0430 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0430');
      }},
      { text: '\u0423\u0434\u0430\u043B\u0438\u0442\u044C', danger: true, onClick: function() {
        if (confirm('\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u044D\u0442\u0443 \u043A\u0430\u0440\u0442\u0438\u043D\u043A\u0443?')) {
          sd.imageHotspots.splice(dataIndex, 1);
          if (hotspotObj && container) container.destroyHotspot(hotspotObj);
          closeModal();
          autoSave();
          notify('\u041A\u0430\u0440\u0442\u0438\u043D\u043A\u0430 \u0443\u0434\u0430\u043B\u0435\u043D\u0430');
        }
      }},
      { text: '\u041E\u0442\u043C\u0435\u043D\u0430', onClick: closeModal }
    ]);
    wireUploadZone('adminImgUrl');
  }

  // ========================================
  // ===== SCENE MANAGEMENT
  // ========================================
  function showScenesModal() {
    var rows = '';
    adminData.scenes.forEach(function(scene, i) {
      rows += '<div class="admin-scene-row">' +
        '<span class="admin-scene-num">' + (i + 1) + '.</span>' +
        '<input type="text" class="admin-input admin-scene-name" data-id="' + scene.id + '" value="' + escapeAttr(scene.name) + '">' +
      '</div>';
    });

    createModal('\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u044F \u0441\u0446\u0435\u043D', rows, [
      { text: '\u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C', primary: true, onClick: function() {
        var inputs = activeModal.querySelectorAll('.admin-scene-name');
        inputs.forEach(function(input) {
          var id = input.getAttribute('data-id');
          var newName = input.value;
          var scene = sceneDataById(id);
          if (scene) scene.name = newName;

          // Update scene list DOM
          var sceneEl = document.querySelector('#sceneList .scene[data-id="' + id + '"] .text');
          if (sceneEl) sceneEl.textContent = newName;
        });

        // Update current scene title bar
        var cur = window.TOUR.currentScene;
        if (cur) {
          var sd = sceneDataById(cur.data.id);
          if (sd) {
            var nameEl = document.querySelector('#titleBar .sceneName');
            if (nameEl) nameEl.textContent = sd.name;
          }
        }

        closeModal();
        autoSave();
        notify('\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u044F \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u044B');
      }},
      { text: '\u041E\u0442\u043C\u0435\u043D\u0430', onClick: closeModal }
    ]);
  }

  // ========================================
  // ===== VIEW LIMITS PER SCENE
  // ========================================
  function showViewLimitsModal() {
    var cur = window.TOUR.currentScene;
    if (!cur) { notify('\u041D\u0435\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0439 \u0441\u0446\u0435\u043d\u044b'); return; }
    var sd = sceneDataById(cur.data.id);
    if (!sd) return;

    var vl = sd.viewLimits || {};
    var maxUp = vl.maxUpEdge != null ? vl.maxUpEdge : 50;
    var maxDown = vl.maxDownEdge != null ? vl.maxDownEdge : 50;
    var minFov = vl.minFov != null ? vl.minFov : 30;
    var maxFov = vl.maxFov != null ? vl.maxFov : 120;

    var content =
      '<p class="admin-hint">\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0443\u0433\u043b\u043e\u0432 \u043e\u0431\u0437\u043e\u0440\u0430 \u0434\u043b\u044f \u0441\u0446\u0435\u043d\u044b: <b>' + escapeHtml(sd.name) + '</b></p>' +
      '<label>\u2191 \u041c\u0430\u043a\u0441. \u0432\u0432\u0435\u0440\u0445 (\u00b0): <b id="valUp">' + maxUp + '</b></label>' +
      '<input type="range" id="adminLimitUp" class="admin-range" min="10" max="90" step="1" value="' + maxUp + '">' +
      '<label>\u2193 \u041c\u0430\u043a\u0441. \u0432\u043d\u0438\u0437 (\u00b0): <b id="valDown">' + maxDown + '</b></label>' +
      '<input type="range" id="adminLimitDown" class="admin-range" min="10" max="90" step="1" value="' + maxDown + '">' +
      '<label>\uD83D\uDD0D \u041c\u0438\u043d. FOV / \u043c\u0430\u043a\u0441. \u0437\u0443\u043c (\u00b0): <b id="valMinFov">' + minFov + '</b></label>' +
      '<input type="range" id="adminMinFov" class="admin-range" min="10" max="90" step="1" value="' + minFov + '">' +
      '<label>\uD83D\uDD2D \u041c\u0430\u043a\u0441. FOV / \u043c\u0438\u043d. \u0437\u0443\u043c (\u00b0): <b id="valMaxFov">' + maxFov + '</b></label>' +
      '<input type="range" id="adminMaxFov" class="admin-range" min="60" max="150" step="1" value="' + maxFov + '">';

    var modal = createModal('\u0423\u0433\u043b\u044b \u043e\u0431\u0437\u043e\u0440\u0430', content, [
      { text: '\u041f\u0440\u0438\u043c\u0435\u043d\u0438\u0442\u044c \u043a\u043e \u0432\u0441\u0435\u043c', onClick: function() {
        var limits = readLimitInputs();
        adminData.scenes.forEach(function(s) {
          s.viewLimits = JSON.parse(JSON.stringify(limits));
          window.TOUR.updateViewLimits(s.id, limits);
        });
        closeModal();
        autoSave();
        notify('\u0423\u0433\u043b\u044b \u043f\u0440\u0438\u043c\u0435\u043d\u0435\u043d\u044b \u043a\u043e \u0432\u0441\u0435\u043c \u0441\u0446\u0435\u043d\u0430\u043c');
      }},
      { text: '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c', primary: true, onClick: function() {
        var limits = readLimitInputs();
        sd.viewLimits = limits;
        window.TOUR.updateViewLimits(sd.id, limits);
        closeModal();
        autoSave();
        notify('\u0423\u0433\u043b\u044b \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b \u0434\u043b\u044f \u00ab' + sd.name + '\u00bb');
      }},
      { text: '\u041e\u0442\u043c\u0435\u043d\u0430', onClick: closeModal }
    ]);

    // Live preview while dragging sliders.
    ['adminLimitUp', 'adminLimitDown', 'adminMinFov', 'adminMaxFov'].forEach(function(id) {
      var el = modal.querySelector('#' + id);
      if (!el) return;
      el.addEventListener('input', function() {
        updateSliderLabels(modal);
        var limits = readLimitInputs();
        window.TOUR.updateViewLimits(sd.id, limits);
      });
    });
  }

  function readLimitInputs() {
    return {
      maxUpEdge: parseInt(document.getElementById('adminLimitUp').value, 10),
      maxDownEdge: parseInt(document.getElementById('adminLimitDown').value, 10),
      minFov: parseInt(document.getElementById('adminMinFov').value, 10),
      maxFov: parseInt(document.getElementById('adminMaxFov').value, 10)
    };
  }

  function updateSliderLabels(modal) {
    var v;
    v = modal.querySelector('#adminLimitUp'); if (v) modal.querySelector('#valUp').textContent = v.value;
    v = modal.querySelector('#adminLimitDown'); if (v) modal.querySelector('#valDown').textContent = v.value;
    v = modal.querySelector('#adminMinFov'); if (v) modal.querySelector('#valMinFov').textContent = v.value;
    v = modal.querySelector('#adminMaxFov'); if (v) modal.querySelector('#valMaxFov').textContent = v.value;
  }

  // ========================================
  // ===== SAVE CURRENT VIEW
  // ========================================
  function doSaveView() {
    var cur = window.TOUR.currentScene;
    if (!cur) return;

    var view = cur.view;
    var params = { yaw: view.yaw(), pitch: view.pitch(), fov: view.fov() };

    var sd = sceneDataById(cur.data.id);
    if (sd) {
      sd.initialViewParameters = params;
      autoSave();
      notify('\u0420\u0430\u043A\u0443\u0440\u0441 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D: yaw=' + params.yaw.toFixed(2) +
        ' pitch=' + params.pitch.toFixed(2) + ' fov=' + params.fov.toFixed(2));
    }
  }

  // ========================================
  // ===== PERSISTENCE
  // ========================================
  function autoSave() {
    try {
      localStorage.setItem(LS_DATA_KEY, JSON.stringify(adminData));
    } catch (e) {
      console.error('[Admin] localStorage save failed:', e);
    }
    if (firebaseDB) syncToFirebase();
  }

  function doSave() {
    autoSave();
    notify('\u0414\u0430\u043D\u043D\u044B\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B');
  }

  function doReset() {
    if (!confirm('\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0432\u0441\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043A \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u043C\u0443 data.js?')) return;
    localStorage.removeItem(LS_DATA_KEY);
    if (firebaseDB) {
      try { firebaseDB.ref('tourData').remove(); } catch (e) {}
    }
    notify('\u0421\u0431\u0440\u043E\u0441 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D. \u041F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430...');
    setTimeout(function() {
      location.href = location.pathname + '?admin';
    }, 800);
  }

  function doExport() {
    var js = 'var APP_DATA = ' + JSON.stringify(adminData, null, 2) + ';\n';
    var blob = new Blob([js], { type: 'application/javascript;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'data.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('data.js \u0441\u043A\u0430\u0447\u0430\u043D');
  }

  // ========================================
  // ===== FIREBASE
  // ========================================
  function tryInitFirebase() {
    try {
      var config = JSON.parse(localStorage.getItem(LS_FIREBASE_KEY));
      if (config && config.apiKey && config.databaseURL) {
        loadFirebaseSDK(config);
      }
    } catch (e) {}
  }

  function loadFirebaseSDK(config) {
    if (window.firebase) {
      connectFirebase(config);
      return;
    }
    var s1 = document.createElement('script');
    s1.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js';
    s1.onload = function() {
      var s2 = document.createElement('script');
      s2.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js';
      s2.onload = function() { connectFirebase(config); };
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  }

  function connectFirebase(config) {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      firebaseDB = firebase.database();

      // Load data from Firebase (cloud takes priority)
      firebaseDB.ref('tourData').once('value').then(function(snapshot) {
        var fbData = snapshot.val();
        if (fbData && fbData.scenes) {
          adminData = fbData;
          localStorage.setItem(LS_DATA_KEY, JSON.stringify(adminData));
          notify('\u0414\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u044B \u0438\u0437 Firebase');
        }
      });

      notify('Firebase \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D');
    } catch (e) {
      console.error('[Admin] Firebase init failed:', e);
      notify('\u041E\u0448\u0438\u0431\u043A\u0430 Firebase: ' + e.message);
    }
  }

  function syncToFirebase() {
    if (!firebaseDB) return;
    try {
      firebaseDB.ref('tourData').set(adminData);
    } catch (e) {
      console.error('[Admin] Firebase sync failed:', e);
    }
  }

  function showImgBBModal() {
    var currentKey = getImgBBKey();
    var content =
      '<p class="admin-hint">\u0417\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u0443\u0439\u0442\u0435\u0441\u044C \u043D\u0430 ' +
      '<a href="https://api.imgbb.com/" target="_blank">api.imgbb.com</a> ' +
      '\u0438 \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u0435 \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u044B\u0439 API-\u043A\u043B\u044E\u0447. ' +
      '\u041F\u043E\u0441\u043B\u0435 \u044D\u0442\u043E\u0433\u043E \u043C\u043E\u0436\u043D\u043E \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0442\u044C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F ' +
      '\u043F\u0440\u044F\u043C\u043E \u0441 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0430 (drag-and-drop).</p>' +
      '<label>API Key:</label>' +
      '<input type="text" id="imgbbApiKey" class="admin-input" value="' + escapeAttr(currentKey) + '" placeholder="\u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043A\u043B\u044E\u0447...">' +
      '<div class="admin-firebase-status">' + (currentKey ? '\uD83D\uDFE2 \u041A\u043B\u044E\u0447 \u0437\u0430\u0434\u0430\u043D' : '\u26AA \u041D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u043E') + '</div>';

    createModal('\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 ImgBB', content, [
      { text: '\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C', primary: true, onClick: function() {
        var key = document.getElementById('imgbbApiKey').value.trim();
        if (key) {
          localStorage.setItem(LS_IMGBB_KEY, key);
          notify('ImgBB API-\u043A\u043B\u044E\u0447 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D');
        } else {
          localStorage.removeItem(LS_IMGBB_KEY);
          notify('ImgBB API-\u043A\u043B\u044E\u0447 \u0443\u0434\u0430\u043B\u0451\u043D');
        }
        closeModal();
      }},
      { text: '\u041E\u0442\u043C\u0435\u043D\u0430', onClick: closeModal }
    ]);
  }

  function showFirebaseModal() {
    var config = {};
    try { config = JSON.parse(localStorage.getItem(LS_FIREBASE_KEY)) || {}; } catch (e) {}

    var content =
      '<p class="admin-hint">\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0440\u043E\u0435\u043A\u0442 \u043D\u0430 ' +
      '<a href="https://console.firebase.google.com" target="_blank">Firebase Console</a>, ' +
      '\u0432\u043A\u043B\u044E\u0447\u0438\u0442\u0435 Realtime Database \u0438 \u0441\u043A\u043E\u043F\u0438\u0440\u0443\u0439\u0442\u0435 \u043A\u043E\u043D\u0444\u0438\u0433.</p>' +
      '<label>API Key:</label>' +
      '<input type="text" id="fbApiKey" class="admin-input" value="' + (config.apiKey || '') + '">' +
      '<label>Auth Domain:</label>' +
      '<input type="text" id="fbAuthDomain" class="admin-input" value="' + (config.authDomain || '') + '">' +
      '<label>Database URL:</label>' +
      '<input type="text" id="fbDatabaseURL" class="admin-input" value="' + (config.databaseURL || '') + '" placeholder="https://your-project.firebaseio.com">' +
      '<label>Project ID:</label>' +
      '<input type="text" id="fbProjectId" class="admin-input" value="' + (config.projectId || '') + '">' +
      '<div class="admin-firebase-status">' + (firebaseDB ? '\uD83D\uDFE2 \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E' : '\u26AA \u041D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E') + '</div>';

    createModal('\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 Firebase', content, [
      { text: '\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C', primary: true, onClick: function() {
        var newConfig = {
          apiKey: document.getElementById('fbApiKey').value,
          authDomain: document.getElementById('fbAuthDomain').value,
          databaseURL: document.getElementById('fbDatabaseURL').value,
          projectId: document.getElementById('fbProjectId').value
        };
        if (!newConfig.apiKey || !newConfig.databaseURL) {
          alert('\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 API Key \u0438 Database URL');
          return;
        }
        localStorage.setItem(LS_FIREBASE_KEY, JSON.stringify(newConfig));
        loadFirebaseSDK(newConfig);
        closeModal();
      }},
      { text: '\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C', danger: true, onClick: function() {
        localStorage.removeItem(LS_FIREBASE_KEY);
        firebaseDB = null;
        closeModal();
        notify('Firebase \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D');
      }},
      { text: '\u041E\u0442\u043C\u0435\u043D\u0430', onClick: closeModal }
    ]);
  }

  // ========================================
  // ===== NOTIFICATIONS
  // ========================================
  function notify(text) {
    var el = document.createElement('div');
    el.className = 'admin-notification';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(function() { el.classList.add('show'); }, 10);
    setTimeout(function() {
      el.classList.remove('show');
      setTimeout(function() { el.remove(); }, 300);
    }, 2500);
  }

  // ========================================
  // ===== HELPERS
  // ========================================
  function escapeAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

})();

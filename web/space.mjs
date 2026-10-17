/** Sparse snapshot viewer. Exports createView and DOM-free identity/input helpers. */
export function cellPosition(id) {
  return [id % 8 - 3.5, Math.floor(id / 64) - 3.5, Math.floor(id / 8) % 8 - 3.5];
}

export function pickCell(hit) {
  const id = hit?.object?.userData?.cellId ?? (hit?.object?.userData?.arenaDots ? hit.index : undefined);
  return Number.isInteger(id) && id >= 0 && id < 512 ? id : null;
}

export function cameraIntent(event) {
  const tag = event.target?.tagName?.toLowerCase();
  if (event.ctrlKey || event.metaKey || event.altKey || event.target?.isContentEditable || ['input', 'select', 'textarea', 'button'].includes(tag)) return null;
  return ({ArrowLeft: ['orbit', -1, 0], ArrowRight: ['orbit', 1, 0], ArrowUp: ['orbit', 0, -1], ArrowDown: ['orbit', 0, 1],
    w: ['pan', 0, 1], s: ['pan', 0, -1], a: ['pan', -1, 0], d: ['pan', 1, 0],
    '+': ['zoom', -1], '=': ['zoom', -1], '-': ['zoom', 1], _: ['zoom', 1], r: ['reset']})[event.key.length === 1 ? event.key.toLowerCase() : event.key] ?? null;
}

/** Movement is cumulative from pointer-down; returning to the origin stays a drag. */
export function trackPointer(start, event) {
  return {...start, dragged: start.dragged || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5};
}
export function isPickGesture(start, event) {
  return Boolean(start && start.id === event.pointerId && start.button === 0 && !trackPointer(start, event).dragged);
}

/** createView(container,onSelect) -> {render(snapshot,presentation),resetCamera(),dispose()}. */
export function createView(container, onSelect) {
  const doc = container.ownerDocument;
  const wrapper = doc.createElement('div');
  const help = doc.createElement('p');
  help.textContent = '3D: drag to orbit · right-drag / Shift-drag to pan · wheel to zoom. Focus canvas: arrows orbit · WASD pan · +/- zoom · R reset. X file · Y tier · Z rank.';
  const status = doc.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Loading 3D view…';
  wrapper.append(status, help);
  container.append(wrapper);
  let disposed = false, snapshot = null, runtime = null;
  const api = {
    render(next, _presentation) { snapshot = next; runtime?.render(next); },
    resetCamera() { runtime?.reset(); },
    dispose() { disposed = true; runtime?.dispose(); wrapper.remove(); },
  };
  // Lazy loading keeps identity/input helpers usable under Node without a DOM or GPU.
  Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]).then(([THREE, {OrbitControls}]) => {
    if (disposed) return;
    let renderer, controls, observer;
    const scene = new THREE.Scene();
    const textures = new Set();
    const materials = new Set();
    const geometries = new Set();
    const listen = [];
    const on = (target, name, fn) => { target.addEventListener(name, fn); listen.push(() => target.removeEventListener(name, fn)); };
    const cleanObject = object => {
      object.traverse(child => {
        if (child.geometry) { child.geometry.dispose(); geometries.delete(child.geometry); }
        const list = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
        for (const material of list) {
          if (material.map) { material.map.dispose(); textures.delete(material.map); }
          material.dispose(); materials.delete(material);
        }
      });
      scene.remove(object);
    };
    const cleanup = () => {
      observer?.disconnect();
      listen.forEach(remove => remove());
      controls?.dispose();
      renderer?.setAnimationLoop(null);
      geometries.forEach(value => value.dispose());
      materials.forEach(value => value.dispose());
      textures.forEach(value => value.dispose());
      renderer?.dispose();
      renderer?.domElement.remove();
    };
    try {
      renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
      renderer.setClearColor(0x111820, 1);
      const canvas = renderer.domElement;
      canvas.tabIndex = 0;
      canvas.setAttribute('aria-label', '3D arena. Arrow keys orbit, WASD pan, plus and minus zoom, R resets.');
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.touchAction = 'none';
      const viewport = doc.createElement('div');
      viewport.style.height = 'min(65vh, 640px)';
      viewport.style.minHeight = '280px';
      wrapper.prepend(viewport);
      viewport.append(canvas);
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
      controls = new OrbitControls(camera, canvas);
      controls.minDistance = 3;
      controls.maxDistance = 65;
      const reset = () => { camera.position.set(12, 10, 14); controls.target.set(0, 0, 0); controls.update(); };
      reset();
      const sprite = (text, color, background = '#15202d') => {
        const label = doc.createElement('canvas'); label.width = 256; label.height = 128;
        const ctx = label.getContext('2d');
        if (!ctx) throw new Error('Canvas2D labels are unavailable');
        ctx.fillStyle = background; ctx.fillRect(0, 0, 256, 128);
        ctx.fillStyle = color; ctx.font = 'bold 66px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, 64);
        const map = new THREE.CanvasTexture(label); textures.add(map);
        const material = new THREE.SpriteMaterial({map, depthTest: true}); materials.add(material);
        const object = new THREE.Sprite(material); object.scale.set(0.8, 0.4, 1); return object;
      };
      const coords = new Float32Array(Array.from({length: 512}, (_, id) => cellPosition(id)).flat());
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(coords, 3)); geometries.add(geometry);
      const material = new THREE.PointsMaterial({color: 0x8597ab, size: 0.065, sizeAttenuation: true}); materials.add(material);
      const dots = new THREE.Points(geometry, material); dots.userData.arenaDots = true; scene.add(dots);
      const axes = new THREE.AxesHelper(5); scene.add(axes); geometries.add(axes.geometry); materials.add(axes.material);
      for (const [name, position, color] of [['X file', [5.5, 0, 0], '#ff9393'], ['Y tier', [0, 5.5, 0], '#a7ed95'], ['Z rank', [0, 0, 5.5], '#9cbcff']]) {
        const label = sprite(name, color); label.position.set(...position); label.scale.set(1.5, 0.75, 1); scene.add(label);
      }
      let pieces = new THREE.Group(), markers = new THREE.Group(); scene.add(pieces, markers);
      const render = next => {
        cleanObject(pieces); cleanObject(markers);
        pieces = new THREE.Group(); markers = new THREE.Group(); scene.add(pieces, markers);
        if (!next) return;
        const names = ['', 'K', 'Q', 'R', 'B', 'N', 'P'];
        next.cells.forEach((code, id) => {
          if (!code) return;
          const label = sprite(`${code > 0 ? 'w' : 'b'}${names[Math.abs(code)]}`, code > 0 ? '#ffffff' : '#111111', code > 0 ? '#40556d' : '#c0cbd8');
          label.position.set(...cellPosition(id)); label.userData.cellId = id; pieces.add(label);
        });
        const highlight = (id, selected) => {
          const geo = new THREE.SphereGeometry(selected ? 0.29 : 0.18, 12, 8); geometries.add(geo);
          const mat = new THREE.MeshBasicMaterial({color: selected ? 0xffc857 : 0x51ddc5, wireframe: true}); materials.add(mat);
          const marker = new THREE.Mesh(geo, mat); marker.position.set(...cellPosition(id)); markers.add(marker);
        };
        next.destinations.forEach(id => highlight(id, false));
        if (next.selected >= 0) highlight(next.selected, true);
      };
      const raycaster = new THREE.Raycaster(); raycaster.params.Points.threshold = 0.16;
      const pointer = new THREE.Vector2();
      let gesture = null;
      on(canvas, 'pointerdown', event => {
        canvas.focus({preventScroll: true});
        gesture = gesture ? {...gesture, dragged: true} : {id: event.pointerId, x: event.clientX, y: event.clientY, button: event.button, dragged: false};
      });
      on(canvas, 'pointermove', event => { if (gesture && gesture.id === event.pointerId) gesture = trackPointer(gesture, event); });
      on(canvas, 'pointercancel', () => { gesture = null; });
      on(canvas, 'pointerup', event => {
        const pick = isPickGesture(gesture, event); gesture = null;
        if (!pick || !snapshot) return;
        const rect = canvas.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
        pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects([pieces, dots], true).find(hit => pickCell(hit) !== null);
        if (hit) onSelect(pickCell(hit));
      });
      on(canvas, 'keydown', event => {
        const intent = cameraIntent(event); if (!intent) return; event.preventDefault();
        const [kind, x, y] = intent;
        const offset = camera.position.clone().sub(controls.target);
        if (kind === 'reset') reset();
        if (kind === 'orbit') {
          const spherical = new THREE.Spherical().setFromVector3(offset);
          spherical.theta += x * 0.12; spherical.phi += y * 0.12; spherical.makeSafe();
          camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
        }
        if (kind === 'zoom') camera.position.copy(controls.target).add(offset.multiplyScalar(Math.exp(x * 0.12)).clampLength(3, 65));
        if (kind === 'pan') {
          const shift = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(x * 0.35)
            .add(new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1).multiplyScalar(y * 0.35));
          camera.position.add(shift); controls.target.add(shift);
        }
        controls.update();
      });
      const resize = () => {
        const width = Math.max(1, viewport.clientWidth), height = Math.max(1, viewport.clientHeight);
        renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
      };
      observer = new ResizeObserver(resize); observer.observe(viewport); resize();
      renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
      runtime = {render, reset, dispose: cleanup};
      render(snapshot); status.textContent = '';
    } catch (error) {
      cleanup(); throw error;
    }
  }).catch(error => {
    if (!disposed) { status.setAttribute('role', 'alert'); status.textContent = `3D initialization failed: ${error.message}`; }
  });
  return api;
}

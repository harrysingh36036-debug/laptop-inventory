// machine3d.js — AG Design Consultants
// A 3D Air-Handling Unit (HVAC centrifugal blower) rendered as the hero background.
// Light "drafting board" look: pale steel body, blue edges, contact shadow on white.
// Idle: slow orbit + fan drift + float + travelling energy pulse.
// Engage (click the unit / button): spins up, casing opens, ducts & pipes glow, camera dollies in.
// Honors prefers-reduced-motion (static, no auto motion; one-shot reveal on engage).

import * as THREE from 'three';

const canvas = document.getElementById('bg3d');
const hero = document.getElementById('top');
const btn = document.getElementById('engageBtn');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (canvas && hero) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0.15, 9);

  // ---- Lighting (bright studio for a light scene) ----
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc3cede, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(5, 8, 7); scene.add(key);
  const fill = new THREE.DirectionalLight(0x2e6bff, 0.8); fill.position.set(-7, 2, -3); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x0e7490, 0.7); rim.position.set(-2, 4, -9); scene.add(rim);

  // ---- Materials (pale steel + blue edges) ----
  const steel = new THREE.MeshStandardMaterial({ color: 0xdbe4ef, metalness: 0.55, roughness: 0.32 });
  const steelDark = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.4 });
  const blueEdge = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.5, roughness: 0.3, emissive: 0x2e6bff, emissiveIntensity: 0.0 });
  const amberMat = new THREE.MeshStandardMaterial({ color: 0x92570a, metalness: 0.4, roughness: 0.4, emissive: 0xf6a623, emissiveIntensity: 0.0 });
  const cyanMat = new THREE.MeshStandardMaterial({ color: 0x0c4a5a, metalness: 0.5, roughness: 0.35, emissive: 0x22d3ee, emissiveIntensity: 0.0 });
  const fanMat = new THREE.MeshStandardMaterial({ color: 0x2657c8, metalness: 0.6, roughness: 0.3, emissive: 0x2e6bff, emissiveIntensity: 0.12 });
  const glowMats = [blueEdge, amberMat, cyanMat, fanMat];
  const flowMats = [amberMat, cyanMat, blueEdge]; // pulse with "energy"

  // ---- Machine group ----
  const machine = new THREE.Group();
  const baseY = -0.1;
  machine.position.set(1.55, baseY, 0);
  scene.add(machine);

  // Cabinet (casing) — becomes transparent on engage
  const cabW = 2.4, cabH = 1.8, cabD = 1.4;
  const casing = new THREE.Mesh(new THREE.BoxGeometry(cabW, cabH, cabD, 1, 1, 1), steel.clone());
  casing.material.transparent = true;
  machine.add(casing);
  // Edge frame strips (emissive blue)
  const edgeGeo = new THREE.BoxGeometry(cabW + 0.04, 0.07, cabD + 0.04);
  [[0, cabH / 2], [0, -cabH / 2]].forEach(([y]) => {
    const e = new THREE.Mesh(edgeGeo, blueEdge); e.position.y = y; machine.add(e);
  });
  const vertGeo = new THREE.BoxGeometry(0.07, cabH + 0.04, 0.07);
  [[-cabW / 2, cabD / 2], [cabW / 2, cabD / 2], [-cabW / 2, -cabD / 2], [cabW / 2, -cabD / 2]].forEach(([x, z]) => {
    const v = new THREE.Mesh(vertGeo, blueEdge); v.position.set(x, 0, z); machine.add(v);
  });
  // Internal floor tray
  const tray = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.2, 0.08, cabD - 0.2), steelDark);
  tray.position.y = -cabH / 2 + 0.1; machine.add(tray);

  // Fan assembly (faces +Z, visible spinning blower)
  const fan = new THREE.Group();
  fan.position.set(0, 0.1, cabD / 2 + 0.02);
  machine.add(fan);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.34, 28), steelDark);
  hub.rotation.x = Math.PI / 2; fan.add(hub);
  const bladeGeo = new THREE.BoxGeometry(0.07, 0.62, 0.16);
  const bladeCount = 11;
  for (let i = 0; i < bladeCount; i++) {
    const b = new THREE.Mesh(bladeGeo, fanMat);
    const a = (i / bladeCount) * Math.PI * 2;
    b.position.set(Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0);
    b.rotation.z = a + 0.5; // backward-curved tilt
    fan.add(b);
  }
  const shroud = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.05, 12, 40), steelDark);
  fan.add(shroud);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.6, 28, 1, true), steel);
  cone.rotation.x = -Math.PI / 2; cone.position.z = 0.5; fan.add(cone);
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.5, 20), steelDark);
  motor.rotation.x = Math.PI / 2; motor.position.z = -0.35; fan.add(motor);

  // Supply duct (vertical) with amber flange
  const ductMat = steel.clone();
  const supply = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.3, 28), ductMat);
  supply.position.set(-0.7, cabH / 2 + 0.65, 0.1); machine.add(supply);
  const flange = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 12, 28), amberMat);
  flange.rotation.x = Math.PI / 2; flange.position.set(-0.7, cabH / 2 + 1.28, 0.1); machine.add(flange);

  // Return duct (horizontal, right)
  const ret = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.2, 28), ductMat);
  ret.rotation.z = Math.PI / 2; ret.position.set(cabW / 2 + 0.5, 0.2, 0.1); machine.add(ret);

  // Chilled-water pipes (cyan) along the base, with elbows
  const pipeGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 16);
  [-0.35, 0.35].forEach((off) => {
    const p = new THREE.Mesh(pipeGeo, cyanMat);
    p.position.set(off, -cabH / 2 + 0.25, cabD / 2 - 0.12); machine.add(p);
    const elbow = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.06, 10, 18, Math.PI / 2), cyanMat);
    elbow.position.set(off, -cabH / 2 + 0.4, cabD / 2 - 0.12); machine.add(elbow);
  });

  // ---- Contact shadow (soft ellipse on white) ----
  function makeShadowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, 'rgba(15,23,42,0.30)');
    g.addColorStop(1, 'rgba(15,23,42,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 3.0),
    new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(1.55, -cabH / 2 - 0.12, 0);
  shadow.renderOrder = -1;
  scene.add(shadow);

  // ---- State & interaction ----
  const state = {
    engaged: false,
    spin: 0, spinTarget: reduce ? 0 : 0.7,
    glow: 0, glowTarget: 0,
    casing: 1, casingTarget: 1,
    camZ: 9, camZTarget: 9,
    parX: 0, parY: 0, tParX: 0, tParY: 0,
    idleRot: 0
  };
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function setEngaged(on) {
    state.engaged = on;
    state.spinTarget = reduce ? 0 : (on ? 3.6 : 0.7);
    state.glowTarget = on ? 1 : 0;
    state.casingTarget = on ? 0.12 : 1;
    state.camZTarget = on ? 7.2 : 9;
    if (btn) {
      btn.setAttribute('aria-pressed', String(on));
      const lbl = btn.querySelector('.engage-label');
      if (lbl) lbl.textContent = on ? 'Disengage systems' : 'Engage systems';
    }
    if (reduce) render();
  }

  function pointerToNDC(e) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }
  function overMachine(e) {
    pointerToNDC(e); ray.setFromCamera(ndc, camera);
    return ray.intersectObject(machine, true).length > 0;
  }

  // Click directly on the machine (not empty hero space) toggles the unit
  hero.addEventListener('click', (e) => {
    if (e.target.closest('a,button,input,textarea,select,.engage-btn')) return;
    if (overMachine(e)) setEngaged(!state.engaged);
  });
  if (btn) btn.addEventListener('click', () => setEngaged(!state.engaged));

  hero.addEventListener('pointermove', (e) => {
    if (reduce) return;
    state.tParY = (ndc.x = ((e.clientX - hero.getBoundingClientRect().left) / hero.clientWidth) * 2 - 1) * 0.28;
    state.tParX = (ndc.y = -((e.clientY - hero.getBoundingClientRect().top) / hero.clientHeight) * 2 + 1) * 0.16;
    hero.style.cursor = overMachine(e) ? 'pointer' : 'default';
  });
  hero.addEventListener('pointerleave', () => { state.tParX = 0; state.tParY = 0; });

  // ---- Resize ----
  function resize() {
    const w = hero.clientWidth, h = hero.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (reduce) render();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- Loop ----
  const clock = new THREE.Clock();
  function render() { renderer.render(scene, camera); }

  let running = false;
  function start() { if (!running && !reduce) { running = true; clock.getDelta(); requestAnimationFrame(frame); } }

  function frame() {
    if (document.hidden) { running = false; return; }
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    state.spin += (state.spinTarget - state.spin) * Math.min(1, dt * 3);
    state.glow += (state.glowTarget - state.glow) * Math.min(1, dt * 3);
    state.casing += (state.casingTarget - state.casing) * Math.min(1, dt * 4);
    state.camZ += (state.camZTarget - state.camZ) * Math.min(1, dt * 3);
    state.parX += (state.tParX - state.parX) * Math.min(1, dt * 4);
    state.parY += (state.tParY - state.parY) * Math.min(1, dt * 4);
    state.idleRot += dt * 0.18;

    fan.rotation.z += state.spin * dt;
    casing.material.opacity = state.casing;
    camera.position.z = state.camZ;

    // Travelling energy pulse along ducts/pipes
    const pulse = state.glow * (0.5 + 0.5 * Math.sin(t * 2.2));
    glowMats.forEach((m) => {
      const base = m === cyanMat ? 0.8 : m === amberMat ? 1.0 : m === fanMat ? 0.12 : 0.7;
      m.emissiveIntensity = base * state.glow + (flowMats.indexOf(m) >= 0 ? pulse * 0.6 : 0);
    });

    // Gentle float + idle orbit + parallax
    machine.position.y = baseY + Math.sin(t * 0.8) * 0.05;
    machine.rotation.y = state.parY + state.idleRot;
    machine.rotation.x = state.parX + Math.sin(t * 0.5) * 0.03;

    render();
    requestAnimationFrame(frame);
  }

  if (reduce) { render(); }
  else { start(); }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else start();
  });
}

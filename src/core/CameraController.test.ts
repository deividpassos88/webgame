import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraController } from './CameraController';

describe('CameraController dead zone', () => {
  it('does not recenter the player while movement stays inside the dead zone', () => {
    const controller = new CameraController(16 / 9);
    controller.snapTo(new THREE.Vector3(0, 0, 0));

    controller.update(new THREE.Vector3(2, 0, 2), 1);

    // Default zoom 1.1 frames both the player and the open celestial horizon.
    expect(controller.camera.position.x).toBeCloseTo(0);
    expect(controller.camera.position.z).toBeCloseTo(52 * 1.1);
    expect(controller.camera.position.y).toBeCloseTo(24 * 1.1);
    expect(controller.camera.fov).toBe(55);
    // The audience is framed in the upper portion without sacrificing VFX projection.
    const audience = new THREE.Vector3(0, 5, -29).project(controller.camera);
    expect(audience.y).toBeLessThan(1);
    expect(audience.y).toBeGreaterThan(0);
    // The opening between north galleries reveals elevated distant temples.
    const distantTemple = new THREE.Vector3(0, 24, -116).project(controller.camera);
    expect(distantTemple.y).toBeLessThan(1);
    expect(distantTemple.y).toBeGreaterThan(-1);
    const viewDirection = controller.camera.getWorldDirection(new THREE.Vector3());
    const declination = Math.atan2(-viewDirection.y,
      Math.hypot(viewDirection.x, viewDirection.z)) * 180 / Math.PI;
    // Camera top frustum must cross the horizon; the prior setup did not.
    expect(declination).toBeLessThan(controller.camera.fov / 2);
  });

  it('follows only the distance that exceeds the dead zone', () => {
    const controller = new CameraController(16 / 9);
    controller.snapTo(new THREE.Vector3(0, 0, 0));

    controller.update(new THREE.Vector3(5, 0, -5), 1);

    // dead zone 3: followTarget fica em (2, 0, -2)
    expect(controller.followTargetX()).toBeCloseTo(2);
    expect(controller.camera.position.x).toBeCloseTo(2);
    // câmera z = followTarget(-2) + offset(22) * zoom(1.10)
    expect(controller.camera.position.z).toBeCloseTo(-2 + 52 * 1.1);
  });

  it('clamps player zoom but allows free zoom in admin mode', () => {
    const controller = new CameraController(16 / 9);

    // jogador: limitado entre 1.0 e 1.6
    controller.adjustZoom(-5);
    expect(controller.zoom).toBe(0.45);
    controller.adjustZoom(+10);
    expect(controller.zoom).toBe(4.0);

    // ADM: faixa ampliada
    controller.setAdminMode(true);
    controller.adjustZoom(-10);
    expect(controller.zoom).toBe(0.45);
    controller.adjustZoom(+10);
    expect(controller.zoom).toBe(4.0);

    // desligando ADM volta ao padrão
    controller.setAdminMode(false);
    expect(controller.zoom).toBe(1.1);
  });
});

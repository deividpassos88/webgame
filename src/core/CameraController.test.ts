import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraController } from './CameraController';

describe('CameraController dead zone', () => {
  it('does not recenter the player while movement stays inside the dead zone', () => {
    const controller = new CameraController(16 / 9);
    controller.snapTo(new THREE.Vector3(0, 0, 0));

    controller.update(new THREE.Vector3(2, 0, 2), 1);

    // zoom padrão do jogador = 1.20 -> aproxima leitura do personagem e dos VFX.
    expect(controller.camera.position.x).toBeCloseTo(0);
    expect(controller.camera.position.z).toBeCloseTo(11 * 1.2);
  });

  it('follows only the distance that exceeds the dead zone', () => {
    const controller = new CameraController(16 / 9);
    controller.snapTo(new THREE.Vector3(0, 0, 0));

    controller.update(new THREE.Vector3(5, 0, -5), 1);

    // dead zone 3: followTarget fica em (2, 0, -2)
    expect(controller.followTargetX()).toBeCloseTo(2);
    expect(controller.camera.position.x).toBeCloseTo(2);
    // câmera z = followTarget(-2) + offset(11) * zoom(1.20)
    expect(controller.camera.position.z).toBeCloseTo(-2 + 11 * 1.2);
  });

  it('clamps player zoom but allows free zoom in admin mode', () => {
    const controller = new CameraController(16 / 9);

    // jogador: limitado entre 1.0 e 1.6
    controller.adjustZoom(-5);
    expect(controller.zoom).toBe(0.85);
    controller.adjustZoom(+10);
    expect(controller.zoom).toBe(1.6);

    // ADM: faixa ampliada
    controller.setAdminMode(true);
    controller.adjustZoom(-10);
    expect(controller.zoom).toBe(0.6);
    controller.adjustZoom(+10);
    expect(controller.zoom).toBe(2.2);

    // desligando ADM volta ao padrão
    controller.setAdminMode(false);
    expect(controller.zoom).toBe(1.2);
  });
});

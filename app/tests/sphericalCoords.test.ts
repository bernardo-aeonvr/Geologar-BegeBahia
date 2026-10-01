/**
 * A convenção yaw/pitch precisa bater com o mapeamento da textura na esfera e com o initialView,
 * senão os pop-ups espaciais apareceriam no lugar errado do panorama.
 */
import { describe, expect, it } from "vitest";
import { directionFromYawPitch, panelWidthForAngle, sphereRotationForYaw } from "../src/viewer/sphericalCoords";

/** Aplica uma rotação em Y (como Object3D.rotation.y) a um vetor. */
function rotateY(v: { x: number; y: number; z: number }, a: number) {
  return { x: v.x * Math.cos(a) + v.z * Math.sin(a), y: v.y, z: -v.x * Math.sin(a) + v.z * Math.cos(a) };
}

const close = (v: { x: number; y: number; z: number }, e: [number, number, number]) => {
  expect(v.x).toBeCloseTo(e[0], 6);
  expect(v.y).toBeCloseTo(e[1], 6);
  expect(v.z).toBeCloseTo(e[2], 6);
};

describe("coordenadas esféricas do panorama", () => {
  it("centro da imagem fica em −X no espaço local da esfera", () => {
    close(directionFromYawPitch(0, 0), [-1, 0, 0]);
    close(directionFromYawPitch(0, 90), [0, 1, 0]);
  });

  it("com initialView.yaw = 0, o centro da imagem aparece à frente da câmera (−Z)", () => {
    close(rotateY(directionFromYawPitch(0, 0), sphereRotationForYaw(0)), [0, 0, -1]);
  });

  it("yaw positivo aparece à direita (+X) na vista inicial", () => {
    close(rotateY(directionFromYawPitch(90, 0), sphereRotationForYaw(0)), [1, 0, 0]);
  });

  it("initialView.yaw = Y traz o ponto yaw = Y para a frente", () => {
    for (const y of [-120, -35, 40, 165]) close(rotateY(directionFromYawPitch(y, 0), sphereRotationForYaw(y)), [0, 0, -1]);
  });

  it("largura angular → largura do painel", () => {
    expect(panelWidthForAngle(90, 100)).toBeCloseTo(200, 6);
  });
});

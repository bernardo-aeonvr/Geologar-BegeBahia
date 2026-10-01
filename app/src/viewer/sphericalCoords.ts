/**
 * Convenção de coordenadas do panorama (usada por initialView, pop-ups espaciais e hotspots):
 *   yaw   0 = centro da imagem equiretangular; positivo = para a direita (graus)
 *   pitch 0 = horizonte; positivo = para cima (graus)
 *
 * Direções são dadas no espaço LOCAL da esfera do panorama (geometria espelhada em X, ver
 * PanoramaRenderer). Assim, tudo que for filho da esfera gira junto com o initialView.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const RAD = Math.PI / 180;

/** Direção unitária (espaço local da esfera) para um ponto yaw/pitch da imagem. */
export function directionFromYawPitch(yaw: number, pitch: number): Vec3 {
  const y = yaw * RAD;
  const p = pitch * RAD;
  // Na esfera espelhada, o centro da imagem (u = 0,5) fica em −X e u crescente vai para −Z.
  return { x: -Math.cos(y) * Math.cos(p), y: Math.sin(p), z: -Math.sin(y) * Math.cos(p) };
}

/** Rotação Y da esfera que traz `yaw` para a frente da câmera (−Z do mundo). */
export function sphereRotationForYaw(yaw: number): number {
  return (-90 + yaw) * RAD;
}

/** Largura de um painel a `distance` que ocupa `angularWidth` graus de campo de visão. */
export function panelWidthForAngle(angularWidth: number, distance: number): number {
  return 2 * distance * Math.tan((angularWidth * RAD) / 2);
}

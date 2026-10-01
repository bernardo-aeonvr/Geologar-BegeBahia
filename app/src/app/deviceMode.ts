/**
 * Decide como a experiência abre ao clicar em "Iniciar":
 *   - "vr"   → headset standalone (Meta Quest, Pico, Wolvic…): entra direto em WebXR imersivo;
 *   - "flat" → celular, tablet e PC (inclusive PC com óculos plugado): panorama na tela.
 *
 * Precisa ser resolvido ANTES do clique: `isSessionSupported` é assíncrono, e o pedido de sessão
 * VR só é aceito dentro do gesto do usuário.
 *
 * Só suporte a `immersive-vr` não basta: o Chrome do Android também o anuncia (modo Cardboard),
 * e o celular cairia em tela dividida. Por isso exige também um navegador de headset.
 */
export type ViewMode = "vr" | "flat";

/** Navegadores de headsets standalone. */
const HEADSET_UA = /OculusBrowser|MetaQuest|\bQuest\b|Pico|Wolvic/i;

export interface XRNavigatorLike {
  userAgent: string;
  xr?: { isSessionSupported(mode: "immersive-vr"): Promise<boolean> };
}

export async function detectViewMode(nav: XRNavigatorLike, forced?: string | null): Promise<ViewMode> {
  if (forced === "vr" || forced === "flat") return forced;
  if (!nav.xr || !HEADSET_UA.test(nav.userAgent)) return "flat";
  try {
    return (await nav.xr.isSessionSupported("immersive-vr")) ? "vr" : "flat";
  } catch {
    return "flat";
  }
}

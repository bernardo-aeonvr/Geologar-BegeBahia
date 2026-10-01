import { describe, expect, it } from "vitest";
import { detectViewMode } from "../src/app/deviceMode";

const xr = (supported: boolean) => ({ isSessionSupported: async () => supported });

const UA = {
  quest3:
    "Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0.0.0 SamsungBrowser/4.0 Chrome/132.0.0.0 VR Safari/537.36",
  pico: "Mozilla/5.0 (Linux; Android 12; Pico 4 Build/S) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 VR Safari/537.36 PicoBrowser/4.0",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

describe("modo de abertura (VR × tela)", () => {
  it("Meta Quest e Pico com WebXR abrem em VR", async () => {
    expect(await detectViewMode({ userAgent: UA.quest3, xr: xr(true) })).toBe("vr");
    expect(await detectViewMode({ userAgent: UA.pico, xr: xr(true) })).toBe("vr");
  });

  it("celular Android NÃO entra em VR mesmo anunciando immersive-vr (Cardboard)", async () => {
    expect(await detectViewMode({ userAgent: UA.android, xr: xr(true) })).toBe("flat");
  });

  it("PC com óculos plugado (immersive-vr suportado) abre na tela", async () => {
    expect(await detectViewMode({ userAgent: UA.windows, xr: xr(true) })).toBe("flat");
  });

  it("iPhone sem WebXR abre na tela", async () => {
    expect(await detectViewMode({ userAgent: UA.iphone })).toBe("flat");
  });

  it("headset sem suporte (ou erro na consulta) abre na tela", async () => {
    expect(await detectViewMode({ userAgent: UA.quest3, xr: xr(false) })).toBe("flat");
    const broken = { isSessionSupported: async () => Promise.reject(new Error("x")) };
    expect(await detectViewMode({ userAgent: UA.quest3, xr: broken })).toBe("flat");
  });

  it("?mode=vr|flat força o modo (testes)", async () => {
    expect(await detectViewMode({ userAgent: UA.windows }, "vr")).toBe("vr");
    expect(await detectViewMode({ userAgent: UA.quest3, xr: xr(true) }, "flat")).toBe("flat");
  });
});

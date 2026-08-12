"use client";

type WinnerCardGeneratorProps = {
  editionNumber: number;
  prize: string;
  confirmedAt: string;
  username: string;
};

type CardFormat = "feed" | "story";

const sizes: Record<CardFormat, { width: number; height: number; label: string }> = {
  feed: { width: 1080, height: 1350, label: "Feed 1080 x 1350" },
  story: { width: 1080, height: 1920, label: "Historia 1080 x 1920" },
};

function drawCard(canvas: HTMLCanvasElement, format: CardFormat, props: WinnerCardGeneratorProps) {
  const { width, height } = sizes[format];
  const context = canvas.getContext("2d");
  if (!context) throw new Error("CANVAS_UNAVAILABLE");
  canvas.width = width;
  canvas.height = height;

  const background = context.createRadialGradient(width * .78, height * .08, 20, width * .45, height * .45, height);
  background.addColorStop(0, "#123b3e");
  background.addColorStop(.42, "#071416");
  background.addColorStop(1, "#050708");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "#28e6ee";
  context.lineWidth = 3;
  context.strokeRect(54, 54, width - 108, height - 108);
  context.fillStyle = "#ff3b4f";
  context.save();
  context.translate(width - 180, 0);
  context.rotate(-.38);
  context.fillRect(0, -70, 18, 360);
  context.restore();

  const center = width / 2;
  context.textAlign = "center";
  context.fillStyle = "#f4f8f9";
  context.font = "900 64px Arial, sans-serif";
  context.fillText("SUPER", center - 35, format === "story" ? 260 : 220);
  const superWidth = context.measureText("SUPER").width;
  context.fillStyle = "#28e6ee";
  context.fillText(".AR", center - 35 + superWidth / 2 + 44, format === "story" ? 260 : 220);
  context.font = "700 22px Arial, sans-serif";
  context.letterSpacing = "12px";
  context.fillStyle = "#8d9ba1";
  context.fillText("CLUB", center, format === "story" ? 304 : 264);

  const titleY = format === "story" ? 650 : 480;
  context.letterSpacing = "4px";
  context.font = "800 28px Arial, sans-serif";
  context.fillStyle = "#28e6ee";
  context.fillText(`GANADOR SORTEO #${String(props.editionNumber).padStart(3, "0")}`, center, titleY);
  context.letterSpacing = "0px";
  context.font = "900 118px Arial, sans-serif";
  context.fillStyle = "#f4f8f9";
  context.fillText("GANADOR", center, titleY + 145);

  context.font = "900 82px Arial, sans-serif";
  context.fillStyle = "#28e6ee";
  const visibleUsername = `@${props.username}`;
  const maxUsernameWidth = width - 150;
  let usernameSize = 82;
  while (context.measureText(visibleUsername).width > maxUsernameWidth && usernameSize > 44) {
    usernameSize -= 4;
    context.font = `900 ${usernameSize}px Arial, sans-serif`;
  }
  context.fillText(visibleUsername, center, titleY + 270);

  context.fillStyle = "#0d1b1e";
  context.strokeStyle = "#24575a";
  context.lineWidth = 2;
  const boxY = titleY + 355;
  context.beginPath();
  context.roundRect(125, boxY, width - 250, 190, 28);
  context.fill();
  context.stroke();
  context.font = "700 24px Arial, sans-serif";
  context.fillStyle = "#8d9ba1";
  context.fillText("PREMIO", center, boxY + 55);
  context.font = "900 45px Arial, sans-serif";
  context.fillStyle = "#f4f8f9";
  context.fillText(props.prize.slice(0, 36), center, boxY + 125);

  context.font = "700 25px Arial, sans-serif";
  context.fillStyle = "#8d9ba1";
  const date = new Intl.DateTimeFormat("es-AR", { dateStyle: "long" }).format(new Date(props.confirmedAt));
  context.fillText(date, center, height - 150);
}

export function WinnerCardGenerator(props: WinnerCardGeneratorProps) {
  async function download(format: CardFormat) {
    const canvas = document.createElement("canvas");
    drawCard(canvas, format, props);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `superar-ganador-sorteo-${String(props.editionNumber).padStart(3, "0")}-${format}.png`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="winner-asset-panel">
      <div className="winner-card-preview" aria-hidden="true">
        <span>SUPER<em>.AR</em></span>
        <small>GANADOR SORTEO #{String(props.editionNumber).padStart(3, "0")}</small>
        <strong>@{props.username}</strong>
        <p>{props.prize}</p>
      </div>
      <div className="winner-asset-copy">
        <p className="eyebrow cyan">PLACA OFICIAL</p>
        <h2>Lista para compartir</h2>
        <p>Se crea ahora en este dispositivo. No se guarda ninguna imagen en Supabase.</p>
        <div>
          {(Object.keys(sizes) as CardFormat[]).map((format) => (
            <button key={format} type="button" onClick={() => download(format)}>Descargar {sizes[format].label}</button>
          ))}
        </div>
      </div>
    </section>
  );
}

import { useEffect, useState } from "react";
import { BackgroundPicker } from "../theme-panel/background-picker";
import { loadPickerBg, savePickerBg, savePickerBgDim } from "@/lib/theme-storage";

export function PickerBackground() {
  const [image, setImage] = useState<string | null>(null);
  const [dim, setDim] = useState(55);

  useEffect(() => {
    let alive = true;
    void loadPickerBg().then((v) => {
      if (!alive) return;
      setImage(v.image);
      setDim(v.dim);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <BackgroundPicker
      imageData={image}
      dim={dim}
      onImageChange={(data) => {
        setImage(data);
        void savePickerBg(data);
      }}
      onDimChange={(next) => {
        setDim(next);
        void savePickerBgDim(next);
      }}
    />
  );
}

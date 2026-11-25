// src/components/SnapPayButton.tsx
import { useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface SnapPayButtonProps {
  onExtract: (value: string) => void;
  extractType?: "phone" | "meter" | "smartcard" | "number";
  label?: string;
}

export function SnapPayButton({ 
  onExtract, 
  extractType = "number",
  label = "Snap & Pay"
}: SnapPayButtonProps) {
  const [loading, setLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const handleImageCapture = async (file: File) => {
    setLoading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("ocr-extract", {
        body: { 
          image_base64: base64,
          extract_type: extractType 
        },
      });

      if (error) throw error;
      if (data.success && data.extracted) {
        onExtract(data.extracted);
        toast.success(`Extracted: ${data.extracted}`);
        setShowCamera(false);
      } else {
        toast.error("No number found in image. Please try again.");
      }
    } catch (error: any) {
      toast.error(error.message || "OCR failed. Please try typing instead.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageCapture(file);
    }
    e.target.value = "";
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowCamera(true)}
        disabled={loading}
        className="flex items-center gap-2 text-xs text-primary hover:underline transition"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
        {loading ? "Processing..." : label}
      </button>

      {showCamera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-background rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">Capture Image</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Take a photo or select an image containing the number you want to extract.
            </p>
            <div className="space-y-3">
              <label className="block">
                <span className="sr-only">Choose image</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileInput}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                  disabled={loading}
                />
              </label>
              <button
                onClick={() => setShowCamera(false)}
                className="w-full py-2 border rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}



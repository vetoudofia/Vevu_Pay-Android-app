// src/components/SnapPayButton.tsx
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Camera, Loader2, X } from "lucide-react";
import Tesseract from "tesseract.js";

interface SnapPayButtonProps {
  onExtract: (value: string) => void;
  extractType?: "phone" | "meter" | "smartcard" | "number";
  label?: string;
  className?: string;
}

export function SnapPayButton({
  onExtract,
  extractType = "number",
  label = "Snap & Pay",
  className = "",
}: SnapPayButtonProps) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Improved OCR with preprocessing ──────────────────────────
  const runOCR = async (imageData: string): Promise<string> => {
    // Use Tesseract with digit whitelist and PSM (Page Segmentation Mode)
    const ocrOptions = {
      // Whitelist only digits
      tessedit_char_whitelist: "0123456789",
      // Page segmentation mode: assume a single uniform block of text
      tessedit_pageseg_mode: "6",
    } as unknown as Parameters<typeof Tesseract.recognize>[2];
    const result = await Tesseract.recognize(imageData, "eng", ocrOptions);

    return result.data.text;
  };

  // ─── Extract numbers from recognized text ─────────────────────
  const extractNumber = (text: string): string | null => {
    // Remove all non-digit characters
    const digits = text.replace(/\D/g, "");
    if (!digits) return null;

    if (extractType === "phone") {
      // Nigerian phone: 11 digits starting with 0, or 13 with 234
      const phoneMatch = digits.match(/(0[789][01]\d{8})/);
      if (phoneMatch) return phoneMatch[0];
      const phoneWithCountry = digits.match(/(234[789][01]\d{8})/);
      if (phoneWithCountry) return "0" + phoneWithCountry[0].slice(3);
      return digits.slice(0, 11); // fallback
    } else if (extractType === "meter" || extractType === "smartcard") {
      // Look for 10-12 digit numbers (most common)
      const match = digits.match(/\d{10,12}/);
      if (match) return match[0];
      return digits.slice(0, 12); // fallback
    } else {
      // Default: return the first number found
      return digits;
    }
  };

  // ─── Handle image capture ──────────────────────────────────────
  const handleImage = async (file: File) => {
    setLoading(true);
    setImagePreview(URL.createObjectURL(file));

    try {
      // Convert to data URL
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      // Run OCR
      const recognizedText = await runOCR(dataUrl);
      console.log("📝 OCR result:", recognizedText);

      // Extract numbers
      const extracted = extractNumber(recognizedText);
      if (extracted) {
        setExtractedText(extracted);
        // Auto‑confirm after a short delay
        setTimeout(() => {
          onExtract(extracted);
          toast.success(`✅ Extracted: ${extracted}`);
          setShowModal(false);
          setImagePreview(null);
          setExtractedText("");
          setLoading(false);
        }, 800);
      } else {
        toast.error("No valid number found in the image. Please try again.");
        setLoading(false);
      }
    } catch (err) {
      console.error("OCR error:", err);
      toast.error("Failed to extract number. Please try again.");
      setLoading(false);
    }
  };

  // ─── File input change ──────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImage(file);
    }
    e.target.value = "";
  };

  // ─── Manual correction ──────────────────────────────────────────
  const confirmExtract = () => {
    if (extractedText) {
      onExtract(extractedText);
      toast.success(`✅ Extracted: ${extractedText}`);
      setShowModal(false);
      setImagePreview(null);
      setExtractedText("");
      setLoading(false);
    }
  };

  const cancelExtract = () => {
    setShowModal(false);
    setImagePreview(null);
    setExtractedText("");
    setLoading(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className={`inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline transition ${className}`}
      >
        <Camera className="h-4 w-4" />
        {label}
      </button>

      {/* ─── Modal ────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="text-lg font-semibold">📷 Snap & Pay</h3>
              <button
                onClick={cancelExtract}
                className="rounded-full p-1 hover:bg-secondary/80"
                disabled={loading}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {loading && (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="mt-3 text-sm text-muted-foreground">Extracting number...</p>
                </div>
              )}

              {!loading && imagePreview && (
                <div className="space-y-3">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full max-h-64 object-contain rounded-lg border border-border"
                  />
                  {extractedText && (
                    <div className="bg-secondary/30 p-3 rounded-lg">
                      <p className="text-sm font-medium">Detected number:</p>
                      <p className="text-xl font-mono font-bold text-primary">{extractedText}</p>
                      <p className="text-xs text-muted-foreground">Is this correct?</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={confirmExtract}
                      className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90"
                    >
                      ✅ Confirm
                    </button>
                    <button
                      onClick={() => {
                        setImagePreview(null);
                        setExtractedText("");
                        fileInputRef.current?.click();
                      }}
                      className="flex-1 py-2 border border-border rounded-lg font-medium hover:bg-secondary/20"
                    >
                      🔄 Retake
                    </button>
                  </div>
                </div>
              )}

              {!loading && !imagePreview && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground text-center">
                    Take a photo or select an image containing the number you want to extract.
                  </p>
                  <label className="block w-full py-3 px-4 bg-primary/10 border-2 border-dashed border-primary/30 rounded-xl text-center cursor-pointer hover:bg-primary/20 transition">
                    <span className="text-sm font-medium text-primary">📸 Choose Image</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>📱 Phone numbers</div>
                    <div>⚡ Meter numbers</div>
                    <div>📺 Smartcard numbers</div>
                    <div>🎲 Betting IDs</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

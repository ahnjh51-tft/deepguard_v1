import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Upload, AlertCircle, CheckCircle, XCircle, Maximize2, Loader2, Info } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useHistoryData } from "@/context/HistoryContext";
import { useAuth } from "@/context/AuthContext";

// Types
interface DetectionResult {
  is_fake: boolean;
  confidence: number;
  original_with_boxes?: string;
  ela_heatmap?: string;
  ela_with_boxes?: string;
  message?: string;
}

const MODEL_ID = "ela_rf";
const MODEL_NAME = "ELA + Random Forest";

const ImageUpload = ({ onImageSelect }: { onImageSelect: (file: File) => void }) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onImageSelect(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onImageSelect(e.target.files[0]);
    }
  };

  return (
    <div
      className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-colors ${dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-secondary/50"
        }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input
        type="file"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        onChange={handleChange}
        accept="image/png, image/jpeg, image/webp"
      />
      <div className="flex flex-col items-center gap-4">
        <div className="p-4 rounded-full bg-secondary">
          <Upload className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <p className="text-lg font-medium text-foreground">クリックまたはドラッグ＆ドロップ</p>
          <p className="text-sm text-muted-foreground mt-1">PNG, JPG, WEBP (最大8MB)</p>
        </div>
      </div>
    </div>
  );
};

const DetectionTab = () => {
  const { user } = useAuth();
  const { addEntry } = useHistoryData();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [explainability, setExplainability] = useState<Record<string, any> | null>(null);
  const [enlargedIndex, setEnlargedIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const viewImages = useMemo(() => {
    if (!explainability) return [];
    return [
      { src: explainability.original_with_boxes, title: "疑わしい領域（原画像）" },
      { src: explainability.ela_heatmap, title: "ELAヒートマップ" },
      { src: explainability.ela_with_boxes, title: "ELA＋疑わしい領域" },
    ].filter((img) => img.src);
  }, [explainability]);

  const handleImageSelect = (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "エラー",
        description: "ファイルサイズは8MB以下にしてください。",
      });
      return;
    }
    setUploadedFile(file);
    setPreviewImage(URL.createObjectURL(file));
    setResult(null);
    setExplainability(null);
  };

  const mapResponseToResult = (data: any): DetectionResult => {
    // Handle both old and new API formats
    const isFake = data.is_fake ?? (data.prediction === "Fake");
    const confidence = data.confidence ?? 0;
    return {
      is_fake: isFake,
      confidence: confidence,
      original_with_boxes: data.original_with_boxes,
      ela_heatmap: data.ela_heatmap,
      ela_with_boxes: data.ela_with_boxes,
      message: data.message,
    };
  };

  const handleDetect = async () => {
    if (!uploadedFile) return;

    setIsDetecting(true);
    setResult(null);
    setExplainability(null);

    const formData = new FormData();
    formData.append("file", uploadedFile);
    formData.append("model_id", MODEL_ID);

    try {
      // Use relative URL to proxy
      const response = await fetch("/api/detect", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      const detectionResult = mapResponseToResult(data);

      setResult(detectionResult);
      setExplainability(detectionResult);

      // Add to history
      addEntry({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        userId: user?.email || "anonymous",
        modelId: MODEL_ID,
        modelName: MODEL_NAME,
        resultLabel: detectionResult.is_fake ? "偽物 (Fake)" : "本物 (Real)",
        confidence: detectionResult.confidence * 100,
        previewDataUrl: previewImage || "",
        originalWithBoxes: detectionResult.original_with_boxes,
        elaHeatmap: detectionResult.ela_heatmap,
        elaWithBoxes: detectionResult.ela_with_boxes,
      });

      toast({
        title: "検出完了",
        description: "画像の解析が完了しました。",
      });
    } catch (error) {
      console.error("Detection failed:", error);
      toast({
        variant: "destructive",
        title: "エラー",
        description: "検出に失敗しました。もう一度お試しください。",
      });
    } finally {
      setIsDetecting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Column: Upload & Controls */}
      <div className="space-y-6">
        <Card className="vertex-card">
          <CardHeader className="border-b border-border bg-secondary/30 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-medium">
              <Upload className="w-5 h-5 text-primary" />
              画像アップロード
            </CardTitle>
            <CardDescription>
              ディープフェイク検証を行う画像を選択してください
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <ImageUpload onImageSelect={handleImageSelect} />

            {previewImage && (
              <div className="relative rounded-lg overflow-hidden border border-border bg-secondary/10">
                <img src={previewImage} alt="Preview" className="w-full h-64 object-contain" />
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute top-2 right-2 shadow-sm"
                  onClick={() => {
                    setUploadedFile(null);
                    setPreviewImage(null);
                    setResult(null);
                  }}
                >
                  削除
                </Button>
              </div>
            )}

            <div className="space-y-3">
              <label className="text-sm font-normal text-foreground">検出モデル</label>
              <Select value={MODEL_ID} disabled>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={MODEL_NAME} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={MODEL_ID}>{MODEL_NAME}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3" />
                ELA (Error Level Analysis) と Random Forest を組み合わせたモデルです。
              </p>
            </div>

            <Button
              className="w-full h-11 text-base shadow-sm"
              onClick={handleDetect}
              disabled={!uploadedFile || isDetecting}
            >
              {isDetecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  解析中...
                </>
              ) : (
                "検出開始"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Results */}
      <div className="space-y-6">
        <Card className="vertex-card h-full min-h-[500px] flex flex-col">
          <CardHeader className="border-b border-border bg-secondary/30 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-medium">
              <AlertCircle className="w-5 h-5 text-primary" />
              解析結果
            </CardTitle>
            <CardDescription>
              AIによる判定レポート
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pt-6">
            {!result && !isDetecting && (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 opacity-60">
                <div className="p-6 rounded-full bg-secondary">
                  <Maximize2 className="w-12 h-12" />
                </div>
                <p>画像をアップロードして検出を開始してください</p>
              </div>
            )}

            {isDetecting && (
              <div className="h-full flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <p className="text-muted-foreground animate-pulse">AIが画像を解析しています...</p>
              </div>
            )}

            {result && (
              <div className="space-y-8 animate-fade-in">
                {/* Result Banner */}
                <div className={`p-6 rounded-lg border flex items-center gap-4 ${result.is_fake
                  ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-900/50 dark:text-emerald-400"
                  }`}>
                  {result.is_fake ? (
                    <XCircle className="w-12 h-12 flex-shrink-0" />
                  ) : (
                    <CheckCircle className="w-12 h-12 flex-shrink-0" />
                  )}
                  <div>
                    <h3 className="text-2xl font-bold">
                      {result.is_fake ? "偽物 (FAKE)" : "本物 (REAL)"}
                    </h3>
                    <p className="text-sm opacity-90 mt-1">
                      信頼度スコア: <span className="font-mono font-bold text-lg">{(result.confidence * 100).toFixed(1)}%</span>
                    </p>
                  </div>
                </div>

                {/* Explainability Images */}
                {viewImages.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Maximize2 className="w-4 h-4" />
                      詳細分析
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {viewImages.map((img, idx) => (
                        <div
                          key={idx}
                          className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-secondary/10 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                          onClick={() => setEnlargedIndex(idx)}
                        >
                          <img src={img.src} alt={img.title} className="w-full h-full object-contain" />
                          <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm p-2 text-center transition-transform translate-y-full group-hover:translate-y-0">
                            <span className="text-xs font-medium text-white">{img.title}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Image Dialog */}
      <Dialog open={enlargedIndex !== null} onOpenChange={() => setEnlargedIndex(null)}>
        <DialogContent className="max-w-4xl bg-background border-border">
          {enlargedIndex !== null && viewImages[enlargedIndex] && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="font-medium">{viewImages[enlargedIndex].title}</h3>
              </div>
              <div className="relative bg-secondary/20 rounded-lg overflow-hidden flex items-center justify-center min-h-[400px]">
                <img
                  src={viewImages[enlargedIndex].src}
                  alt={viewImages[enlargedIndex].title}
                  className="max-w-full max-h-[80vh] object-contain"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DetectionTab;

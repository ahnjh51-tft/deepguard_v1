import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Calendar, TrendingUp, CheckCircle, XCircle, BarChart3, Download, Maximize2 } from "lucide-react";
import { useHistoryData } from "@/context/HistoryContext";
import { useAuth } from "@/context/AuthContext";

type TimeRange = "daily" | "weekly" | "monthly";

const HistoryTab = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>("daily");
  const { history } = useHistoryData();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [selectedEntry, setSelectedEntry] = useState<typeof history[number] | null>(null);

  const fallbackThumbnail =
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop";

  const stats = useMemo(() => {
    const total = history.length;
    const real = history.filter((entry) => entry.resultLabel.includes("本物") || entry.resultLabel.includes("Real")).length;
    const fake = total - real;
    return { total, real, fake };
  }, [history]);

  const realPercentage = stats.total > 0 ? (stats.real / stats.total) * 100 : 0;

  const buildCsv = () => {
    const header = ["timestamp", "user_id", "model", "result", "confidence"];
    const rows = history.map((entry) => [
      entry.timestamp,
      entry.userId,
      entry.modelName,
      entry.resultLabel,
      entry.confidence.toFixed(2),
    ]);
    return [header, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
  };

  const buildJson = () => {
    return JSON.stringify(
      history.map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        user_id: entry.userId,
        model: entry.modelName,
        result: entry.resultLabel,
        confidence: entry.confidence,
      })),
      null,
      2
    );
  };

  const triggerDownload = (payload: string, filename: string, mime: string) => {
    const blob = new Blob([payload], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    if (!history.length) return;
    triggerDownload(buildCsv(), `deepguard_history_${Date.now()}.csv`, "text/csv;charset=utf-8;");
  };

  const handleExportJson = () => {
    if (!history.length) return;
    triggerDownload(buildJson(), `deepguard_history_${Date.now()}.json`, "application/json;charset=utf-8;");
  };

  return (
    <>
      <div className="space-y-6">
        {/* Stats Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="vertex-card">
            <CardHeader className="pb-3 bg-secondary/30">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                総検出数
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-3xl font-bold text-foreground">{stats.total}</div>
            </CardContent>
          </Card>

          <Card className="vertex-card">
            <CardHeader className="pb-3 bg-secondary/30">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                本物の割合
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-3xl font-bold text-emerald-600">{realPercentage.toFixed(1)}%</div>
            </CardContent>
          </Card>

          <Card className="vertex-card">
            <CardHeader className="pb-3 bg-secondary/30">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                偽物の割合
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-3xl font-bold text-red-600">
                {(100 - realPercentage).toFixed(1)}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="vertex-card">
          <CardHeader className="border-b border-border bg-secondary/30 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-medium">
              <Calendar className="w-5 h-5 text-primary" />
              期間フィルター
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
              <SelectTrigger className="w-full md:w-64 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">日次</SelectItem>
                <SelectItem value="weekly">週次</SelectItem>
                <SelectItem value="monthly">月次</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* History List */}
        <Card className="vertex-card">
          <CardHeader className="border-b border-border bg-secondary/30 pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg font-medium">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  検出履歴
                </CardTitle>
                <CardDescription>過去の検出結果一覧</CardDescription>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportCsv}
                    disabled={!history.length}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportJson}
                    disabled={!history.length}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    JSON
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {history.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground">
                検出履歴がまだありません。
              </div>
            ) : (
              <div className="space-y-4">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-secondary/50 transition-all cursor-pointer"
                    onClick={() => setSelectedEntry(item)}
                  >
                    <div className="relative w-16 h-16 rounded-md overflow-hidden border border-border">
                      <img
                        src={item.previewDataUrl || fallbackThumbnail}
                        alt="Thumbnail"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {item.resultLabel.includes("本物") || item.resultLabel.includes("Real") ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        )}
                        <span
                          className={`font-medium ${item.resultLabel.includes("本物") || item.resultLabel.includes("Real")
                              ? "text-emerald-600"
                              : "text-red-600"
                            } truncate`}
                        >
                          {item.resultLabel}
                        </span>
                        <span className="text-sm text-muted-foreground">({item.confidence.toFixed(1)}%)</span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{item.modelName}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm text-foreground">
                        {new Date(item.timestamp).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent className="max-w-5xl bg-background border-border">
          {selectedEntry && (
            <div className="space-y-6">
              <div className="border-b border-border pb-4">
                <div className={`text-2xl font-bold mb-2 ${selectedEntry.resultLabel.includes("本物") || selectedEntry.resultLabel.includes("Real")
                    ? "text-emerald-600"
                    : "text-red-600"
                  }`}>
                  {selectedEntry.resultLabel}
                </div>
                <div className="text-sm text-muted-foreground flex gap-4">
                  <span>{new Date(selectedEntry.timestamp).toLocaleString()}</span>
                  <span>•</span>
                  <span className="text-primary">{selectedEntry.modelName}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { src: selectedEntry.originalWithBoxes, title: "Original" },
                  { src: selectedEntry.elaHeatmap, title: "ELA Heatmap" },
                  { src: selectedEntry.elaWithBoxes, title: "Analysis" },
                ]
                  .filter((img) => img.src)
                  .map((img) => (
                    <div
                      key={img.title}
                      className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-secondary/10"
                    >
                      <img src={img.src as string} alt={img.title} className="w-full h-full object-contain" />
                      <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm p-2 text-center">
                        <span className="text-xs font-medium text-white/90">{img.title}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HistoryTab;

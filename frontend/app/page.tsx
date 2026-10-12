"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import jsPDF from "jspdf";
import html2canvas from "html2canvas"; // ★ 追加

const MapComponent = dynamic(() => import("./MapComponent"), { ssr: false });

interface Spot {
  name: string;
  stay_minutes: number;
  buffer_minutes: number;
  priority: number;
  lat: number;
  lng: number;
  is_start?: boolean;
  is_end?: boolean;
}

export default function Home() {
  const [spots, setSpots] = useState<Spot[]>([
    { name: "京都駅 (出発地)", stay_minutes: 10, buffer_minutes: 5, priority: 5, lat: 34.985849, lng: 135.758767, is_start: true },
    { name: "清水寺", stay_minutes: 60, buffer_minutes: 15, priority: 5, lat: 34.994857, lng: 135.785046 },
    { name: "伏見稲荷大社", stay_minutes: 90, buffer_minutes: 15, priority: 5, lat: 34.967140, lng: 135.772671 },
    { name: "金閣寺", stay_minutes: 45, buffer_minutes: 10, priority: 3, lat: 35.039370, lng: 135.729243 },
    { name: "京都駅 (ゴール)", stay_minutes: 10, buffer_minutes: 0, priority: 5, lat: 34.985849, lng: 135.758767, is_end: true },
  ]);

  const [startTime, setStartTime] = useState("09:30");
  const [deadlineTime, setDeadlineTime] = useState("16:30");
  const [travelMode, setTravelMode] = useState<"DRIVE" | "WALK" | "TRANSIT">("DRIVE");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [newStay, setNewStay] = useState(45);
  const [newBuffer, setNewBuffer] = useState(10);
  const [newPriority, setNewPriority] = useState(3);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // しおり編集用ステート
  const [shioriTitle, setShioriTitle] = useState("京都満喫日帰りプラン");
  const [shioriMemo, setShioriMemo] = useState("水分補給をこまめに！歩きやすい靴で参加すること。");
  const [shioriBelongings, setShioriBelongings] = useState("モバイルバッテリー, 飲み物, 御朱印帳, 雨具");
  const [showShioriModal, setShowShioriModal] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  const handleAddSpotWithGeocode = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);

    try {
      const res = await fetch(`http://localhost:8000/api/geocode?query=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) {
        alert("該当する場所が見つかりませんでした。別の名称を試してください。");
        return;
      }
      const coords = await res.json();
      setSpots([
        ...spots,
        {
          name: searchQuery,
          stay_minutes: Number(newStay),
          buffer_minutes: Number(newBuffer),
          priority: Number(newPriority),
          lat: coords.lat,
          lng: coords.lng,
          is_start: false,
          is_end: false,
        },
      ]);
      setSearchQuery("");
    } catch (e) {
      alert("座標の取得に失敗しました。");
    } finally {
      setSearchLoading(false);
    }
  };

  const removeSpot = (index: number) => {
    setSpots(spots.filter((_, i) => i !== index));
  };

  const updateSpotBuffer = (index: number, buffer: number) => {
    setSpots(spots.map((s, i) => (i === index ? { ...s, buffer_minutes: buffer } : s)));
  };

  const updateSpotStay = (index: number, stay: number) => {
    setSpots(spots.map((s, i) => (i === index ? { ...s, stay_minutes: stay } : s)));
  };

  const toggleFixedSpot = (index: number, type: "start" | "end") => {
    setSpots(
      spots.map((spot, i) => {
        if (type === "start") {
          return {
            ...spot,
            is_start: i === index ? !spot.is_start : false,
            is_end: i === index ? false : spot.is_end,
          };
        } else {
          return {
            ...spot,
            is_end: i === index ? !spot.is_end : false,
            is_start: i === index ? false : spot.is_start,
          };
        }
      })
    );
  };

  const handleOptimize = async () => {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("http://localhost:8000/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spots,
          start_time: startTime,
          deadline_time: deadlineTime,
          travel_mode: travelMode,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        alert(`最適化エラー: ${err}`);
        return;
      }
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      alert(`サーバー接続エラー: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ★ 日本語文字化け・labエラーを完全防止した画像ベースPDF出力
  const handleDownloadPdf = async () => {
    const element = document.getElementById("shiori-export-area");
    if (!element) return;

    setPdfGenerating(true);
    try {
      // 画面の見た目・日本語フォントをそのまま Canvas にキャプチャ
      const canvas = await html2canvas(element, {
        // @ts-ignore
        scale: 2, // 高解像度（鮮明）
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");

      // A4 サイズ (幅 210mm, 高さ 297mm)
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${shioriTitle || "旅のしおり"}.pdf`);
    } catch (e: any) {
      console.error(e);
      alert("PDF生成に失敗しました: " + e.message);
    } finally {
      setPdfGenerating(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="border-b border-slate-200 pb-4 flex flex-col md:flex-row justify-between md:items-end gap-2">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">
              Smart Route Optimizer 🗺️
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Google Maps Routes API × バッファ付き逆算スケジューラー
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white p-2 px-3 rounded-xl border border-slate-200 shadow-sm text-xs font-semibold">
            <span className="text-slate-500">移動手段:</span>
            {[
              { id: "DRIVE", label: "🚗 車" },
              { id: "WALK", label: "🚶 徒歩" },
              { id: "TRANSIT", label: "🚌 公共交通" },
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => setTravelMode(mode.id as any)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  travelMode === mode.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* 左側：設定とスポットリスト */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
              <h2 className="text-base font-bold text-slate-700">⏰ 行動時間設定</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 font-medium">開始時刻</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full mt-1 border border-slate-200 p-2 rounded-xl text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium">絶対締め切り時刻</label>
                  <input
                    type="time"
                    value={deadlineTime}
                    onChange={(e) => setDeadlineTime(e.target.value)}
                    className="w-full mt-1 border border-slate-200 p-2 rounded-xl text-sm font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* 新規スポット追加 */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3">
              <h2 className="text-base font-bold text-slate-700">📍 スポットを追加（地名検索）</h2>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="例: 二条城, 平安神宮, 京都タワー"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full border border-slate-200 p-2.5 rounded-xl text-sm"
                />
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">滞在(分):</span>
                    <input
                      type="number"
                      value={newStay}
                      onChange={(e) => setNewStay(Number(e.target.value))}
                      className="w-full mt-1 border border-slate-200 p-1.5 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <span className="text-slate-500">予備バッファ(分):</span>
                    <input
                      type="number"
                      value={newBuffer}
                      onChange={(e) => setNewBuffer(Number(e.target.value))}
                      className="w-full mt-1 border border-slate-200 p-1.5 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <span className="text-slate-500">優先度 (1-5):</span>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={newPriority}
                      onChange={(e) => setNewPriority(Number(e.target.value))}
                      className="w-full mt-1 border border-slate-200 p-1.5 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddSpotWithGeocode}
                  disabled={searchLoading}
                  className="w-full mt-2 bg-slate-800 hover:bg-slate-900 text-white py-2 rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  {searchLoading ? "座標を検索中..." : "＋ 地図検索して追加"}
                </button>
              </div>
            </div>

            {/* スポット一覧 */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-bold text-slate-700">訪問候補スポット ({spots.length})</h2>
                <span className="text-[11px] text-slate-400">旗で発着地固定 / 予備バッファ選択</span>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {spots.map((spot, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border transition flex flex-col gap-2.5 ${
                      spot.is_start
                        ? "bg-emerald-50 border-emerald-300"
                        : spot.is_end
                        ? "bg-purple-50 border-purple-300"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 text-sm">{spot.name}</span>
                      <button onClick={() => removeSpot(i)} className="text-red-400 hover:text-red-600 font-bold px-1">
                        ✕
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-slate-200">
                        <span className="text-slate-400 text-[11px]">滞在:</span>
                        <input
                          type="number"
                          value={spot.stay_minutes}
                          onChange={(e) => updateSpotStay(i, Number(e.target.value))}
                          className="w-12 text-center font-bold text-slate-700 outline-none"
                        />
                        <span className="text-slate-400 text-[11px]">分</span>
                      </div>

                      <div className="flex items-center gap-1 bg-white p-1.5 rounded-lg border border-slate-200">
                        <span className="text-amber-600 text-[11px] font-medium">🛡️予備:</span>
                        <input
                          type="number"
                          value={spot.buffer_minutes}
                          onChange={(e) => updateSpotBuffer(i, Number(e.target.value))}
                          className="w-12 text-center font-bold text-amber-700 outline-none"
                        />
                        <span className="text-slate-400 text-[11px]">分</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                      <span>優先度 ★{spot.priority}</span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => toggleFixedSpot(i, "start")}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                            spot.is_start
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-200 hover:bg-slate-300 text-slate-600"
                          }`}
                        >
                          🚩 出発地
                        </button>
                        <button
                          onClick={() => toggleFixedSpot(i, "end")}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                            spot.is_end
                              ? "bg-purple-600 text-white"
                              : "bg-slate-200 hover:bg-slate-300 text-slate-600"
                          }`}
                        >
                          🏁 目的地
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleOptimize}
                disabled={loading}
                className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md transition disabled:opacity-50 text-sm"
              >
                {loading ? "Google Maps Routes API で最適化中..." : "⚡ ルートを逆算・最適化する"}
              </button>
            </div>
          </div>

          {/* 右側：マップ & 結果表示 */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-sm font-bold text-slate-700 mb-3">🗺️ ルートマップ</h2>
              <MapComponent schedule={result?.schedule || []} />
            </div>

            {result && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
                <div className="flex items-center justify-between border-b pb-3">
                  <div>
                    <span className="text-xs text-slate-400 font-medium">完了予定時刻</span>
                    <div className="text-2xl font-black text-blue-600">{result.final_end_time}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 font-medium">余力バッファ</span>
                    <div className="text-lg font-bold text-emerald-600">+{result.spare_time_minutes} 分</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setShowShioriModal(true)}
                    className="flex items-center justify-center gap-1.5 py-3 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition"
                  >
                    <span>📑 旅のしおりを編集 / ダウンロード</span>
                  </button>

                  {result.google_maps_url && (
                    <a
                      href={result.google_maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition text-center"
                    >
                      <span>🧭 Google マップでナビ</span>
                      <span className="text-[10px] opacity-80">↗</span>
                    </a>
                  )}
                </div>

                {result.skipped_spots && result.skipped_spots.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-800">
                    <span className="font-bold">⚠️ 締め切り遵守のためスキップ:</span> {result.skipped_spots.join(", ")}
                  </div>
                )}

                <div className="space-y-3 pt-1">
                  {result.schedule.map((item: any, idx: number) => (
                    <div key={idx}>
                      {item.type === "travel" ? (
                        <div className="pl-6 py-1 text-xs text-slate-500 flex items-center gap-2 border-l-2 border-blue-200 ml-4 my-1">
                          <span>↓ {item.description} ({item.duration_min}分)</span>
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-800 text-sm">{item.name}</span>
                            <div className="text-slate-500 mt-0.5 flex gap-2">
                              <span>滞在: {item.stay_minutes}分</span>
                              {item.buffer_minutes > 0 && (
                                <span className="text-amber-600 font-semibold">
                                  (予備 +{item.buffer_minutes}分)
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="font-mono font-bold text-slate-700 bg-white px-2 py-1 rounded border">
                            {item.arrive_time} 〜 {item.leave_time}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 旅のしおり編集＆ダウンロード モーダル (印刷機能は完全削除) */}
      {showShioriModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto p-6 md:p-8 space-y-6 relative">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-xl font-bold text-slate-800">📑 旅のしおり（プレビュー &amp; 編集）</h2>
              <button
                onClick={() => setShowShioriModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* ダウンロード対象エリア（シンプルな標準CSSプロパティで統一） */}
            <div
              id="shiori-export-area"
              style={{ backgroundColor: "#ffffff", color: "#1e293b", padding: "24px", borderRadius: "16px", border: "1px solid #e2e8f0" }}
              className="space-y-6"
            >
              <div style={{ textAlign: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "16px" }}>
                <input
                  type="text"
                  value={shioriTitle}
                  onChange={(e) => setShioriTitle(e.target.value)}
                  style={{ fontSize: "24px", fontWeight: "bold", textAlign: "center", width: "100%", outline: "none", border: "none", backgroundColor: "transparent", color: "#0f172a" }}
                />
                <p style={{ fontSize: "12px", color: "#64748b", marginTop: "8px" }}>
                  予定時間: {result?.start_time} 〜 {result?.final_end_time}（余力バッファ: +{result?.spare_time_minutes}分）
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "12px" }}>
                <div style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a", padding: "12px", borderRadius: "12px" }}>
                  <span style={{ fontWeight: "bold", color: "#78350f", display: "block", marginBottom: "4px" }}>📝 メモ・注意事項:</span>
                  <textarea
                    rows={3}
                    value={shioriMemo}
                    onChange={(e) => setShioriMemo(e.target.value)}
                    style={{ width: "100%", backgroundColor: "transparent", color: "#78350f", outline: "none", resize: "none", border: "none" }}
                  />
                </div>
                <div style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", padding: "12px", borderRadius: "12px" }}>
                  <span style={{ fontWeight: "bold", color: "#1e3a8a", display: "block", marginBottom: "4px" }}>🎒 持ち物リスト:</span>
                  <textarea
                    rows={3}
                    value={shioriBelongings}
                    onChange={(e) => setShioriBelongings(e.target.value)}
                    style={{ width: "100%", backgroundColor: "transparent", color: "#1e3a8a", outline: "none", resize: "none", border: "none" }}
                  />
                </div>
              </div>

              <div style={{ marginTop: "16px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: "bold", borderLeft: "4px solid #2563eb", paddingLeft: "8px", marginBottom: "12px", color: "#0f172a" }}>
                  タイムスケジュール
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {result?.schedule?.map((item: any, idx: number) => (
                    <div key={idx}>
                      {item.type === "travel" ? (
                        <div style={{ paddingLeft: "24px", fontSize: "11px", color: "#64748b", borderLeft: "2px solid #bfdbfe", marginLeft: "16px", margin: "4px 0" }}>
                          ↓ {item.description} ({item.duration_min}分)
                        </div>
                      ) : (
                        <div style={{ padding: "12px", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                          <div>
                            <span style={{ fontWeight: "bold", color: "#0f172a" }}>{item.name}</span>
                            <span style={{ color: "#64748b", marginLeft: "8px" }}>
                              滞在 {item.stay_minutes}分
                              {item.buffer_minutes > 0 ? ` + 予備 ${item.buffer_minutes}分` : ""}
                            </span>
                          </div>
                          <div style={{ fontFamily: "monospace", fontWeight: "bold", color: "#334155", backgroundColor: "#ffffff", padding: "4px 8px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                            {item.arrive_time} 〜 {item.leave_time}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* モーダル下部（印刷ボタンは削除、PDFダウンロードのみ） */}
            <div className="flex items-center justify-end gap-3 border-t pt-4">
              <button
                onClick={() => setShowShioriModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                閉じる
              </button>
              
              <button
                onClick={handleDownloadPdf}
                disabled={pdfGenerating}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <span>{pdfGenerating ? "⏳ PDF生成中..." : "📥 PDFをダウンロード"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
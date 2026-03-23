import React, { useState, useRef, useCallback, useEffect } from 'react';
import { uploadTradeImage, deleteTradeImage, UploadProgress } from '../services/r2ImageUpload';

interface TradeImageUploadProps {
  tradeId: string;
  existingImages?: string[]; // URLs already saved in trade.images[]
  pendingImages?: string[];  // URLs for new trades not yet saved
  onImagesChange: (urls: string[]) => void;
  isNewTrade?: boolean; // If true, don't write to Supabase yet (save with trade)
}

const TradeImageUpload: React.FC<TradeImageUploadProps> = ({
  tradeId,
  existingImages = [],
  onImagesChange,
  isNewTrade = false,
}) => {
  const [images, setImages] = useState<string[]>(existingImages || []);
  const [uploadItems, setUploadItems] = useState<UploadProgress[]>([]);

  // Sync when existingImages prop updates (e.g. opening an existing trade for editing)
  useEffect(() => {
    setImages(existingImages || []);
  }, [existingImages]);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!fileArr.length) return;

    // For new trades: collect URLs to pass back to form (saved alongside the trade)
    // For existing trades: upload immediately and append to Supabase
    const newItems: UploadProgress[] = fileArr.map(f => ({
      file: f,
      progress: 0,
      status: 'pending',
    }));

    setUploadItems(prev => [...prev, ...newItems]);

    await Promise.all(
      fileArr.map(async (file, idx) => {
        const itemIdx = uploadItems.length + idx;

        const updateItem = (patch: Partial<UploadProgress>) => {
          setUploadItems(prev => {
            const next = [...prev];
            next[itemIdx] = { ...next[itemIdx], ...patch };
            return next;
          });
        };

        updateItem({ status: 'uploading' });

        try {
          const { publicUrl } = await uploadTradeImage(file, tradeId, (pct) => {
            updateItem({ progress: pct });
          });

          updateItem({ status: 'done', progress: 100 });

          setImages(prev => {
            const updated = [...prev, publicUrl];
            onImagesChange(updated);
            return updated;
          });
        } catch (err: any) {
          updateItem({ status: 'error', error: err.message });
        }
      })
    );
  }, [tradeId, uploadItems.length, onImagesChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDelete = async (url: string, index: number) => {
    // Extract r2Key from URL: everything after the base URL domain
    // e.g. https://pub-xxx.r2.dev/userId/tradeId/filename.jpg → userId/tradeId/filename.jpg
    const r2Key = url.split('.r2.dev/')[1] || url.split('/').slice(3).join('/');

    const updated = images.filter((_, i) => i !== index);
    setImages(updated);
    onImagesChange(updated);

    if (!isNewTrade) {
      try {
        await deleteTradeImage(tradeId, url, r2Key);
      } catch (err) {
        console.error('Failed to delete from R2:', err);
        // Restore on failure
        setImages(prev => {
          const restored = [...prev];
          restored.splice(index, 0, url);
          onImagesChange(restored);
          return restored;
        });
      }
    }
  };

  const activeUploads = uploadItems.filter(u => u.status === 'uploading' || u.status === 'pending');
  const failedUploads = uploadItems.filter(u => u.status === 'error');

  return (
    <>
      <div className="space-y-3">
        {/* Drop zone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          className={`
            relative border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all
            ${isDragging
              ? 'border-black bg-black/5 scale-[1.01]'
              : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'
            }
          `}
        >
          <div className="flex flex-col items-center gap-1.5 pointer-events-none">
            {/* Camera icon using SVG to avoid dependency */}
            <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Drop chart screenshots here
            </span>
            <span className="text-[9px] text-slate-400">
              or click to browse · PNG, JPG, WEBP · max 10MB each
            </span>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />

        {/* Active upload progress bars */}
        {activeUploads.length > 0 && (
          <div className="space-y-1.5">
            {activeUploads.map((item, i) => (
              <div key={i} className="bg-slate-50 rounded-xl p-2.5">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9px] font-black text-slate-600 truncate max-w-[200px]">
                    {item.file.name}
                  </span>
                  <span className="text-[9px] font-black text-slate-400">
                    {item.progress}%
                  </span>
                </div>
                <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-black rounded-full transition-all duration-300"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Failed uploads */}
        {failedUploads.length > 0 && (
          <div className="space-y-1">
            {failedUploads.map((item, i) => (
              <div key={i} className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <div>
                  <p className="text-[9px] font-black text-red-600">{item.file.name}</p>
                  <p className="text-[9px] text-red-400">{item.error}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Image thumbnails grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {images.map((url, i) => (
              <div key={i} className="relative group rounded-xl overflow-hidden aspect-video bg-slate-100">
                <img
                  src={url}
                  alt={`Chart screenshot ${i + 1}`}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setLightboxUrl(url)}
                />
                {/* Overlay with actions */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  {/* View full size */}
                  <button
                    type="button"
                    onClick={() => setLightboxUrl(url)}
                    className="w-7 h-7 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-all"
                  >
                    <svg className="w-3.5 h-3.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                  </button>
                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => handleDelete(url, i)}
                    className="w-7 h-7 bg-red-500/90 rounded-full flex items-center justify-center hover:bg-red-500 transition-all"
                  >
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {/* Image number badge */}
                <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md">
                  {i + 1}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all"
            onClick={() => setLightboxUrl(null)}
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={lightboxUrl}
            alt="Trade chart full size"
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default TradeImageUpload;

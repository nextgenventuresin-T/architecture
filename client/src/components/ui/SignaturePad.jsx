import { useRef, useState, useEffect } from 'react';
import { PenTool, Upload, RotateCcw, Check, X, Image as ImageIcon } from 'lucide-react';
import Button from './Button';

/**
 * Interactive Dual-Mode Signature Pad.
 * Supports drawing directly on HTML5 Canvas (desktop & touch screens)
 * or uploading a high-resolution signature image.
 */
export default function SignaturePad({
  signerName = '',
  onSign,
  onCancel,
  title = 'Digital Signature',
  description = 'Draw your signature using mouse or finger, or upload an image file.',
  submitLabel = 'Confirm & Sign Agreement',
}) {
  const [mode, setMode] = useState('draw'); // 'draw' | 'upload'
  const [name, setName] = useState(signerName);
  const [isEmpty, setIsEmpty] = useState(true);
  const [uploadedImage, setUploadedImage] = useState(null);
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });

  // Canvas drawing setup
  useEffect(() => {
    if (mode !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e1b4b'; // Dark brand ink
  }, [mode]);

  function getCoordinates(e) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startDrawing(e) {
    e.preventDefault();
    isDrawing.current = true;
    lastPoint.current = getCoordinates(e);
  }

  function draw(e) {
    if (!isDrawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const newPoint = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(newPoint.x, newPoint.y);
    ctx.stroke();

    lastPoint.current = newPoint;
    setIsEmpty(false);
  }

  function stopDrawing() {
    isDrawing.current = false;
  }

  function handleClear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  }

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      alert('Please upload a PNG or JPEG signature image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImage(reader.result);
      setIsEmpty(false);
    };
    reader.readAsDataURL(file);
  }

  function handleSubmit() {
    if (!name.trim()) {
      alert('Please enter the signer name.');
      return;
    }

    let signatureData = null;
    if (mode === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || isEmpty) {
        alert('Please draw your signature before submitting.');
        return;
      }
      signatureData = canvas.toDataURL('image/png');
    } else {
      if (!uploadedImage) {
        alert('Please upload a signature image before submitting.');
        return;
      }
      signatureData = uploadedImage;
    }

    if (typeof onSign === 'function') {
      onSign({
        signatureData,
        signerName: name.trim(),
      });
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-6 shadow-xl">
      <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
        <div>
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <PenTool className="h-4 w-4 text-brand-700" />
            {title}
          </h3>
          <p className="text-xs text-ink-subtle mt-0.5">{description}</p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1 text-ink-subtle hover:bg-canvas hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Mode Switcher Tabs */}
      <div className="mb-4 flex rounded-xl border border-line bg-canvas p-1">
        <button
          type="button"
          onClick={() => setMode('draw')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
            mode === 'draw'
              ? 'bg-white text-brand-700 shadow-xs'
              : 'text-ink-subtle hover:text-ink'
          }`}
        >
          <PenTool className="h-3.5 w-3.5" />
          Draw Signature
        </button>
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
            mode === 'upload'
              ? 'bg-white text-brand-700 shadow-xs'
              : 'text-ink-subtle hover:text-ink'
          }`}
        >
          <Upload className="h-3.5 w-3.5" />
          Upload Image
        </button>
      </div>

      {/* Signer Name Input */}
      <div className="mb-4">
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-1">
          Full Name of Signer *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Rajesh Kumar / Twinkle Taneja"
          className="w-full rounded-xl border border-line bg-white px-3.5 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
        />
      </div>

      {/* Signature Canvas Area */}
      {mode === 'draw' ? (
        <div className="space-y-2">
          <div className="relative rounded-xl border-2 border-dashed border-line bg-canvas/40 p-1 text-center overflow-hidden">
            <canvas
              ref={canvasRef}
              width={540}
              height={180}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="w-full cursor-crosshair touch-none bg-white rounded-lg shadow-inner"
            />
            {isEmpty && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-ink-subtle/60">
                Sign above with your mouse, stylus, or finger
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1 text-xs font-medium text-ink-subtle hover:text-ink px-2 py-1 rounded hover:bg-canvas"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear Pad
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-xl border-2 border-dashed border-line bg-canvas/30 p-6 text-center">
            {uploadedImage ? (
              <div className="space-y-3">
                <img
                  src={uploadedImage}
                  alt="Signature Preview"
                  className="mx-auto max-h-32 rounded border border-line bg-white object-contain p-2"
                />
                <label className="inline-block cursor-pointer text-xs text-brand-600 hover:underline">
                  Choose a different image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              <label className="block cursor-pointer">
                <ImageIcon className="mx-auto h-8 w-8 text-ink-subtle/50 mb-2" />
                <p className="text-xs font-semibold text-ink">Upload Signature Image</p>
                <p className="text-[11px] text-ink-subtle mt-0.5">PNG or JPG with transparent or clean background</p>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>
      )}

      {/* Confirmation & Buttons */}
      <div className="mt-5 border-t border-line pt-4 flex items-center justify-between">
        <p className="text-[11px] text-ink-subtle">
          By signing, you legally execute and bind this order agreement.
        </p>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel} size="sm">
              Cancel
            </Button>
          )}
          <Button type="button" onClick={handleSubmit} size="sm" className="gap-1.5">
            <Check className="h-4 w-4" />
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

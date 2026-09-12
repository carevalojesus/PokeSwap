import { useEffect, useRef, useState } from 'react';
import type QrScanner from 'qr-scanner';
import { Button } from '../../components/ui/button';
import { parseDropInput } from './drop-link';

export default function DropScanner({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onCode, onClose });
  useEffect(() => {
    callbacks.current = { onCode, onClose };
  }, [onCode, onClose]);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    let scanner: QrScanner | undefined;
    const element = video.current!;
    function stop() {
      disposed = true;
      // pause(true) releases tracks immediately, including before destroy's delayed stop.
      void scanner?.pause(true);
      scanner?.destroy();
      if (
        typeof MediaStream !== 'undefined' &&
        element.srcObject instanceof MediaStream
      )
        element.srcObject.getTracks().forEach((track) => track.stop());
      element.srcObject = null;
    }
    const leave = () => {
      stop();
      callbacks.current.onClose();
    };
    const visibility = () => {
      if (document.hidden) leave();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', leave);
    void import('qr-scanner')
      .then(async ({ default: Scanner }) => {
        if (disposed) return;
        scanner = new Scanner(
          element,
          ({ data }) => {
            if (disposed) return;
            const code = parseDropInput(data);
            if (!code) {
              setError(
                'Este QR no es un PokéDrop de este sitio. Prueba con el QR de tu docente.',
              );
              return;
            }
            stop();
            callbacks.current.onCode(code);
          },
          {
            preferredCamera: 'environment',
            maxScansPerSecond: 5,
            returnDetailedScanResult: true,
          },
        );
        await scanner.start();
      })
      .catch(() => {
        if (disposed) return;
        stop();
        setError(
          'No pudimos abrir la cámara. Si denegaste el permiso, puedes habilitarlo en tu navegador o usar el enlace o código.',
        );
      });
    return () => {
      stop();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', leave);
    };
  }, []);
  return (
    <section
      aria-label="Escáner de PokéDrop"
      className="flex max-w-xl flex-col items-start gap-4"
    >
      <p role="status">
        Apunta al QR de tu docente. Al reconocerlo se apagará la cámara; después
        pulsa Consultar PokéDrop.
      </p>
      <video
        ref={video}
        muted
        playsInline
        aria-label="Vista de la cámara"
        className="aspect-square w-full rounded-2xl bg-zinc-950 object-cover"
      />
      {error && (
        <p role="alert" className="text-rose-800">
          {error}
        </p>
      )}
      <Button variant="outline" onClick={onClose}>
        Cerrar cámara
      </Button>
    </section>
  );
}

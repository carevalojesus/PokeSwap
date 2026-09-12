import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { dropLink } from './drop-link';

export default function DropShare({ code }: { code: string }) {
  const link = dropLink(code);
  const [message, setMessage] = useState('');
  return (
    <div className="flex max-w-xl flex-col items-start gap-4">
      <QRCodeSVG
        value={link}
        size={288}
        level="M"
        marginSize={4}
        title="QR del PokéDrop"
        role="img"
        className="h-auto max-w-full"
      />
      <label htmlFor="drop-link" className="font-medium">
        Enlace del PokéDrop
      </label>
      <Input
        id="drop-link"
        readOnly
        value={link}
        onFocus={(event) => event.currentTarget.select()}
      />
      <Button
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setMessage('Enlace copiado.');
          } catch {
            setMessage('Selecciona y copia el enlace del campo.');
          }
        }}
      >
        Copiar enlace
      </Button>
      <p role="status" className="text-base text-zinc-600">
        {message ||
          'Escanea con la cámara del teléfono o comparte el enlace. Se requiere una cuenta de alumno y confirmar el canje.'}
      </p>
    </div>
  );
}

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import type { Area } from 'react-easy-crop';
import { useSession } from '../auth/session-context';
import { ApiError, type AvatarMutation } from '../../lib/api/auth';
import { Button } from '../../components/ui/button';
import { cropWebp } from './crop';
const Cropper = lazy(() => import('react-easy-crop'));

export function AvatarPanel() {
  const { profile, updateAvatar, updateProfile } = useSession();
  const [source, setSource] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [attempt, setAttempt] = useState<AvatarMutation | null>(null);
  const [baseVersion, setBaseVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [broken, setBroken] = useState<string | null>(null);
  const mounted = useRef(true);
  const selection = useRef(0);
  const notice = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source);
    },
    [source],
  );
  useEffect(() => {
    if (message) notice.current?.focus();
  }, [message]);
  if (!profile) return null;
  const user = profile.user;
  const imageURL = user.avatarUrl
    ? `${user.avatarUrl}?v=${user.profileVersion}`
    : null;
  async function select(file: File | undefined) {
    if (!file || locked.current) return;
    const token = ++selection.current;
    setMessage('');
    setFailed(false);
    setAttempt(null);
    setArea(null);
    setSource(null);
    if (
      file.size > 5 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    ) {
      setFailed(true);
      setMessage('Selecciona JPEG, PNG o WebP de hasta 5 MiB.');
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      if (!mounted.current || selection.current !== token) {
        URL.revokeObjectURL(url);
        return;
      }
      if (
        !image.width ||
        !image.height ||
        image.width * image.height > 40_000_000
      )
        throw Error('size');
      setSource(url);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setBaseVersion(user.profileVersion);
      setConfirmDelete(false);
    } catch {
      URL.revokeObjectURL(url);
      if (mounted.current) {
        setFailed(true);
        setMessage(
          'No pudimos abrir la imagen. Usa una foto válida de hasta 40 megapíxeles.',
        );
      }
    }
  }
  async function send(next?: AvatarMutation) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      const operation =
        next ??
        attempt ??
        (source && area
          ? {
              kind: 'put' as const,
              blob: await cropWebp(source, area),
              key: crypto.randomUUID(),
              version: baseVersion,
            }
          : null);
      if (!operation) throw Error('crop');
      if (!mounted.current) return;
      setAttempt(operation);
      await updateAvatar(operation);
      if (!mounted.current) return;
      setSource(null);
      setAttempt(null);
      setConfirmDelete(false);
      setArea(null);
      setMessage(
        operation.kind === 'delete'
          ? 'Eliminación confirmada. Se muestra la foto vigente del perfil.'
          : 'Solicitud confirmada. Se muestra la foto vigente del perfil.',
      );
    } catch (error) {
      if (mounted.current) {
        setFailed(true);
        setMessage(
          error instanceof ApiError &&
            ['PROFILE_CONFLICT', 'IDEMPOTENCY_CONFLICT'].includes(error.code)
            ? 'El perfil cambió. Consulta los datos actuales antes de iniciar otra carga.'
            : error instanceof ApiError && error.code === 'UPLOAD_PENDING'
              ? 'La carga sigue pendiente. Puedes reintentar la misma operación o consultar el perfil actual.'
              : 'No pudimos confirmar la foto. Conservamos el intento para reintentar sin duplicarlo; también puedes consultar el perfil actual.',
        );
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function recover() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      await updateProfile();
      if (mounted.current) {
        setSource(null);
        setAttempt(null);
        setArea(null);
        setConfirmDelete(false);
        setFailed(false);
        setMessage('Perfil actual recuperado. Puedes iniciar una nueva carga.');
      }
    } catch {
      if (mounted.current) {
        setFailed(true);
        setMessage(
          'No pudimos consultar el perfil. Tu intento sigue disponible.',
        );
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section
      aria-label="Foto de perfil"
      className="flex flex-col gap-5 border-b border-zinc-950/10 pb-6"
    >
      <div className="flex items-center gap-4">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100">
          {imageURL && broken !== imageURL ? (
            <img
              key={imageURL}
              src={imageURL}
              alt="Foto de perfil guardada"
              className="size-full object-cover"
              onError={() => setBroken(imageURL)}
            />
          ) : (
            <UserRound aria-hidden="true" className="size-12 text-zinc-500" />
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">Tu foto</h2>
          <p className="mt-1 text-base text-pretty text-zinc-600">
            Visible para quienes inicien sesión en la clase.
          </p>
        </div>
      </div>
      {broken === imageURL && imageURL && (
        <p className="text-base text-rose-700">
          No pudimos cargar la foto guardada. Tu perfil conserva su referencia.
        </p>
      )}
      {message && (
        <p
          ref={notice}
          role={failed ? 'alert' : 'status'}
          tabIndex={-1}
          className="text-base focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rose-700"
        >
          {message}
        </p>
      )}
      <div className="flex max-w-xl flex-col gap-2">
        <label htmlFor="avatar-file" className="font-medium">
          Seleccionar foto
        </label>
        <input
          id="avatar-file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || !!attempt}
          onChange={(event) => {
            void select(event.target.files?.[0]);
            event.target.value = '';
          }}
          className="min-h-12 w-full min-w-0 text-base file:mr-3 file:rounded-lg file:border file:border-zinc-300 file:bg-white file:px-3 file:py-2 file:font-medium"
        />
        <p className="text-base text-zinc-600">
          JPEG, PNG o WebP, hasta 5 MiB. Recorta una foto cuadrada antes de
          guardarla.
        </p>
      </div>
      {source && (
        <div className="flex max-w-xl flex-col gap-4">
          <p className="font-medium">Vista previa · aún no guardada</p>
          <div
            inert={busy || !!attempt}
            className="relative h-72 overflow-hidden rounded-xl bg-zinc-900 sm:h-96"
          >
            <Suspense
              fallback={<p className="p-4 text-white">Abriendo recorte…</p>}
            >
              <Cropper
                image={source}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_relative, pixels) => setArea(pixels)}
                restrictPosition
                keyboardStep={10}
                zoomWithScroll={false}
              />
            </Suspense>
          </div>
          <label htmlFor="avatar-zoom" className="font-medium">
            Acercamiento
          </label>
          <input
            id="avatar-zoom"
            type="range"
            min="1"
            max="3"
            step="0.1"
            value={zoom}
            disabled={busy || !!attempt}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="min-h-10 w-full accent-rose-700"
          />
          <p className="text-base text-zinc-600">
            Arrastra la foto para encuadrarla. También puedes enfocar el recorte
            y usar las flechas.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy || !area || !!attempt}
              onClick={() => void send()}
            >
              {busy ? 'Guardando foto…' : 'Guardar foto'}
            </Button>
            <Button
              variant="outline"
              disabled={busy || !!attempt}
              onClick={() => {
                setSource(null);
                setArea(null);
              }}
            >
              Cancelar recorte
            </Button>
          </div>
        </div>
      )}
      {attempt && failed && (
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy} onClick={() => void send()}>
            Reintentar misma operación
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void recover()}
          >
            Consultar perfil y descartar intento
          </Button>
        </div>
      )}
      {!source && !attempt && user.avatarUrl && (
        <div className="flex flex-col items-start gap-3">
          {confirmDelete ? (
            <>
              <p className="text-base">
                ¿Quitar tu foto y volver al avatar predeterminado?
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={busy}
                  onClick={() =>
                    void send({ kind: 'delete', version: user.profileVersion })
                  }
                >
                  Confirmar eliminación
                </Button>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => setConfirmDelete(false)}
                >
                  Conservar foto
                </Button>
              </div>
            </>
          ) : (
            <Button variant="outline" onClick={() => setConfirmDelete(true)}>
              Eliminar foto
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

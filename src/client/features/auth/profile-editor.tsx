import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  profileUpdateSchema,
  type ProfileUpdate,
} from '../../../shared/schemas/profile';
import type { PrivateUserProfile } from '../../../shared/contracts/auth';
import { useSession } from './session-context';
import { ApiError } from '../../lib/api/auth';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

const values = (user: PrivateUserProfile): ProfileUpdate => ({
  firstNames: user.firstNames,
  lastNames: user.lastNames,
  birthDate: user.birthDate,
  profileVersion: user.profileVersion,
});
export function ProfileEditor({
  user,
  onClose,
}: {
  user: PrivateUserProfile;
  onClose: (saved: boolean) => void;
}) {
  const { updateProfile } = useSession();
  const [notice, setNotice] = useState('');
  const [needsReview, setNeedsReview] = useState(false);
  const [reading, setReading] = useState(false);
  const mounted = useRef(true);
  const message = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (notice) message.current?.focus();
  }, [notice]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileUpdate>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: values(user),
  });
  const busy = reading || isSubmitting;
  async function loadCurrent() {
    setReading(true);
    try {
      const current = await updateProfile();
      if (!mounted.current) return;
      reset(values(current.user));
      setNeedsReview(false);
      setNotice(
        'Datos actuales cargados. Revisa el formulario antes de guardar nuevos cambios.',
      );
    } catch {
      if (mounted.current)
        setNotice(
          'No pudimos consultar el perfil. Conservamos tu borrador; vuelve a intentar cargar los datos actuales.',
        );
    } finally {
      if (mounted.current) setReading(false);
    }
  }
  async function submit(input: ProfileUpdate) {
    setNotice('');
    try {
      const result = await updateProfile(input);
      if (!mounted.current) return;
      // A later concurrent save can be returned by the subsequent profile read.
      if (
        result.user.profileVersion !== input.profileVersion + 1 ||
        result.user.firstNames !== input.firstNames ||
        result.user.lastNames !== input.lastNames ||
        result.user.birthDate !== input.birthDate
      ) {
        setNeedsReview(true);
        setNotice(
          'El perfil volvió a cambiar. Carga los datos actuales para revisar el resultado.',
        );
        return;
      }
      onClose(true);
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiError && error.code === 'INVALID_INPUT') {
        setNotice(
          'El servidor rechazó los datos. Revisa nombres, apellidos y fecha de nacimiento.',
        );
      } else {
        setNeedsReview(true);
        setNotice(
          error instanceof ApiError && error.code === 'PROFILE_CONFLICT'
            ? 'Otro dispositivo guardó cambios antes que tú. Tu borrador sigue aquí y no sobrescribimos el perfil. Carga los datos actuales para revisarlos.'
            : 'No pudimos confirmar el guardado. Los cambios podrían haberse guardado. Consulta los datos actuales antes de volver a guardar.',
        );
      }
    }
  }
  return (
    <form
      aria-label="Editar perfil"
      noValidate
      onSubmit={(event) => {
        void handleSubmit(submit)(event);
      }}
      className="flex max-w-xl flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Editar datos personales
        </h2>
        <p className="text-base text-pretty text-zinc-600">
          Puedes corregir tus nombres y nacimiento. El ID SENATI y el nombre de
          entrenador se conservan.
        </p>
      </div>
      {notice && (
        <div
          ref={message}
          role="alert"
          tabIndex={-1}
          className="rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 text-base focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rose-700"
        >
          <p>{notice}</p>
          {needsReview && (
            <div className="mt-4 flex flex-col items-start gap-2">
              <p className="text-zinc-600">
                Cargar los datos actuales reemplaza el borrador de este
                formulario.
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={loadCurrent}
              >
                {reading ? 'Consultando…' : 'Cargar datos actuales'}
              </Button>
            </div>
          )}
        </div>
      )}
      {(
        [
          ['firstNames', 'Nombres', 'text', 'given-name'],
          ['lastNames', 'Apellidos', 'text', 'family-name'],
          ['birthDate', 'Fecha de nacimiento', 'date', 'bday'],
        ] as const
      ).map(([field, label, type, autoComplete]) => (
        <div key={field} className="flex flex-col gap-2">
          <label htmlFor={`profile-${field}`} className="font-medium">
            {label}
          </label>
          <Input
            id={`profile-${field}`}
            type={type}
            autoComplete={autoComplete}
            disabled={busy}
            {...register(field)}
            aria-invalid={!!errors[field]}
            aria-describedby={
              errors[field] ? `profile-${field}-error` : undefined
            }
          />
          {errors[field] && (
            <p
              id={`profile-${field}-error`}
              className="text-base text-rose-700"
            >
              {errors[field].message}
            </p>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy || needsReview}>
          {isSubmitting ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => onClose(false)}
        >
          Cancelar edición
        </Button>
      </div>
    </form>
  );
}

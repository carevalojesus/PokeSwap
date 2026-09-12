import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  useForm,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import {
  loginSchema,
  registrationSchema,
  type LoginInput,
} from '../../../shared/schemas/auth';
import {
  limaDate,
  type RegistrationInput,
} from '../../../shared/schemas/registration';
import { ApiError, authErrorMessage } from '../../lib/api/auth';
import { useSession } from './session-context';
import { PageHeading } from '../../components/page-heading';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';

type Fields = RegistrationInput;
function FieldsForm({
  register,
  errors,
  isRegistration,
  disabled,
}: {
  register: UseFormRegister<Fields>;
  errors: FieldErrors<Fields>;
  isRegistration: boolean;
  disabled: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const fields: {
    name: keyof Fields;
    label: string;
    type: string;
    autoComplete: string;
    hint?: string;
  }[] = [
    {
      name: 'senatiId',
      label: 'ID SENATI',
      type: 'text',
      autoComplete: 'username',
      hint: 'Escríbelo tal como lo usas en SENATI, incluidos los ceros iniciales.',
    },
    ...(isRegistration
      ? [
          {
            name: 'firstNames' as const,
            label: 'Nombres',
            type: 'text',
            autoComplete: 'given-name',
          },
          {
            name: 'lastNames' as const,
            label: 'Apellidos',
            type: 'text',
            autoComplete: 'family-name',
          },
          {
            name: 'birthDate' as const,
            label: 'Fecha de nacimiento',
            type: 'date',
            autoComplete: 'bday',
          },
        ]
      : []),
    {
      name: 'password',
      label: 'Contraseña',
      type: visible ? 'text' : 'password',
      autoComplete: isRegistration ? 'new-password' : 'current-password',
      hint: isRegistration
        ? 'Usa de 15 a 128 caracteres. Una frase larga es fácil de recordar. No recortamos espacios.'
        : undefined,
    },
  ];
  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-5">
      <legend className="sr-only">
        {isRegistration ? 'Datos de tu nueva cuenta' : 'Datos de acceso'}
      </legend>
      {fields.map(({ name, label, type, autoComplete, hint }) => (
        <div key={name} className="flex min-w-0 flex-col gap-2">
          <label htmlFor={name} className="text-base font-medium sm:text-sm">
            {label}
          </label>
          <div className="relative">
            <Input
              {...register(name)}
              id={name}
              type={type}
              autoComplete={autoComplete}
              autoCapitalize={
                name === 'password' || name === 'senatiId' ? 'none' : 'words'
              }
              spellCheck={false}
              aria-invalid={!!errors[name]}
              aria-describedby={
                [
                  hint ? `${name}-hint` : '',
                  errors[name] ? `${name}-error` : '',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              max={name === 'birthDate' ? limaDate(new Date()) : undefined}
              min={name === 'birthDate' ? '0001-01-01' : undefined}
              className={name === 'password' ? 'pr-14' : undefined}
            />
            {name === 'password' && (
              <Button
                variant="ghost"
                className="absolute top-1.5 right-1.5 size-9 p-0"
                aria-label={
                  visible ? 'Ocultar contraseña' : 'Mostrar contraseña'
                }
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Eye aria-hidden="true" />
                )}
              </Button>
            )}
          </div>
          {hint && (
            <p
              id={`${name}-hint`}
              className="text-base text-pretty text-zinc-600 sm:text-sm"
            >
              {hint}
            </p>
          )}
          {errors[name] && (
            <p
              id={`${name}-error`}
              className="flex items-start gap-2 text-base text-red-800 sm:text-sm"
            >
              <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
              {errors[name]?.message}
            </p>
          )}
        </div>
      ))}
    </fieldset>
  );
}

export function AuthPage({ kind }: { kind: 'login' | 'register' }) {
  const isRegistration = kind === 'register';
  const session = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const alert = useRef<HTMLDivElement>(null);
  // Login uses only its two fields; no registration-only values are sent.
  const form = useForm<Fields>({
    resolver: isRegistration
      ? zodResolver(registrationSchema)
      : async (values, context, options) => {
          const result = await zodResolver(loginSchema)(
            { senatiId: values.senatiId, password: values.password },
            context,
            { ...options, names: ['senatiId', 'password'] },
          );
          if (Object.keys(result.errors).length)
            return { values: {}, errors: result.errors };
          return { values: { ...values, ...result.values }, errors: {} };
        },
    defaultValues: {
      senatiId: '',
      password: '',
      ...(isRegistration
        ? { firstNames: '', lastNames: '', birthDate: '' }
        : {}),
    },
  });
  useEffect(() => {
    if (error && !session.loading) alert.current?.focus();
  }, [error, session.loading]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [cooldown]);
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const input: LoginInput | RegistrationInput = isRegistration
        ? values
        : { senatiId: values.senatiId, password: values.password };
      const profile = await session.signIn(kind, input);
      form.reset();
      navigate(profile.user.role === 'teacher' ? '/docente' : '/coleccion', {
        replace: true,
      });
    } catch (failure) {
      if (failure instanceof ApiError && failure.retryAfter)
        setCooldown(failure.retryAfter);
      setError(authErrorMessage(failure, isRegistration));
    }
  });
  return (
    <div className="grid items-start gap-10 xl:grid-cols-[3fr_2fr]">
      <div className="flex flex-col gap-8">
        <PageHeading
          eyebrow={
            isRegistration
              ? 'Tu aventura empieza aquí'
              : 'Qué bueno verte de nuevo'
          }
          title={isRegistration ? 'Crea tu cuenta' : 'Entra a tu aventura'}
          description={
            isRegistration
              ? 'Regístrate como alumno y descubre tu primer Pokémon. Tu inicial será aleatorio y quedará guardado en tu cuenta.'
              : 'Usa tu ID SENATI y contraseña para recuperar tu cuenta. Alumnos y docente ingresan desde aquí.'
          }
        />
        <form
          onSubmit={submit}
          noValidate
          className="flex w-full max-w-xs flex-col gap-6"
          aria-label={
            isRegistration ? 'Crear cuenta de alumno' : 'Iniciar sesión'
          }
          aria-busy={form.formState.isSubmitting}
        >
          {error && (
            <div
              ref={alert}
              tabIndex={-1}
              role="alert"
              className="flex flex-col gap-3 rounded-xl border border-red-800/20 bg-red-50 p-4 outline-none"
            >
              <CircleAlert
                aria-hidden="true"
                className="size-6 shrink-0 stroke-red-800"
              />
              <p className="text-base text-pretty text-red-900">{error}</p>
              {isRegistration && (
                <Link
                  to="/ingresar"
                  className="rounded-sm font-medium text-red-900 underline underline-offset-4"
                >
                  Ir a iniciar sesión
                </Link>
              )}
            </div>
          )}
          <FieldsForm
            register={form.register}
            errors={form.formState.errors}
            isRegistration={isRegistration}
            disabled={form.formState.isSubmitting}
          />
          <Button
            type="submit"
            disabled={form.formState.isSubmitting || cooldown > 0}
            className="w-full"
          >
            {form.formState.isSubmitting
              ? 'Confirmando…'
              : cooldown
                ? `Espera ${cooldown} s`
                : isRegistration
                  ? 'Crear mi cuenta'
                  : 'Iniciar sesión'}
          </Button>
          <p className="text-base text-zinc-600 sm:text-sm">
            {isRegistration ? '¿Ya tienes una cuenta?' : '¿Es tu primera vez?'}{' '}
            <Link
              to={isRegistration ? '/ingresar' : '/registro'}
              className="rounded-sm font-medium text-rose-700 underline underline-offset-4"
            >
              {isRegistration ? 'Inicia sesión' : 'Crea tu cuenta de alumno'}
            </Link>
          </p>
        </form>
      </div>
      <aside className="flex flex-col gap-5 rounded-2xl bg-rose-50 p-6 xl:sticky xl:top-8">
        <LockKeyhole
          aria-hidden="true"
          className="size-6 shrink-0 stroke-rose-700"
        />
        <h2 className="text-2xl font-semibold tracking-tight text-balance">
          Tu colección te espera
        </h2>
        <p className="text-base text-pretty text-zinc-700">
          Tu cuenta conserva el mismo nombre de entrenador y Pokémon inicial al
          volver a ingresar.
        </p>
        <p className="text-base text-pretty text-zinc-700">
          Tus datos personales solo son visibles para ti y el docente. Guarda tu
          contraseña: la recuperación automática aún no está disponible.
        </p>
        {isRegistration && (
          <p className="text-base text-pretty text-zinc-700">
            El docente utiliza una cuenta asignada; este formulario crea cuentas
            de alumno.
          </p>
        )}
        <img
          src="/pokemon/133.png"
          alt="Eevee"
          width={475}
          height={475}
          className="aspect-square w-full max-w-48 self-center object-contain"
        />
      </aside>
    </div>
  );
}

# Club SUPER.AR

AplicaciÃ³n oficial mobile-first de sorteos y fidelizaciÃ³n de SUPER.AR.

## Estado

FASE 1 en desarrollo. El repositorio es privado y todavÃ­a no existe un despliegue pÃºblico.

## TecnologÃ­as

- Next.js con App Router y TypeScript
- Supabase (Auth, Postgres, RLS y funciones de servidor)
- Netlify para despliegue

## ConfiguraciÃ³n local

1. Copiar `.env.example` como `.env.local`.
2. Completar Ãºnicamente las variables del proyecto institucional de Supabase.
3. Instalar dependencias con `pnpm install`.
4. Iniciar con `pnpm dev`.

Las claves secretas nunca deben agregarse al repositorio ni usar el prefijo `NEXT_PUBLIC_`.

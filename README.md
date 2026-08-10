# Club SUPER.AR

Aplicación oficial mobile-first de sorteos y fidelización de SUPER.AR.

## Estado

FASE 1 en desarrollo. El repositorio es privado y todavía no existe un despliegue público.

## Tecnologías

- Next.js con App Router y TypeScript
- Supabase (Auth, Postgres, RLS y funciones de servidor)
- Netlify para despliegue

## Configuración local

1. Copiar `.env.example` como `.env.local`.
2. Completar únicamente las variables del proyecto institucional de Supabase.
3. Instalar dependencias con `pnpm install`.
4. Iniciar con `pnpm dev`.

Las claves secretas nunca deben agregarse al repositorio ni usar el prefijo `NEXT_PUBLIC_`.

import { RegisterForm } from "@/app/auth/register-form";
import Link from "next/link";
export default function RegisterPage() { return <main className="auth-shell"><Link className="brand auth-brand" href="/"><span className="brand-super">SUPER</span><span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small></Link><RegisterForm /></main>; }

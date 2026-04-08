"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Truck,
  Users,
  Wrench,
  DollarSign,
  Settings,
  LogOut,
} from "lucide-react";

const menuItems = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Corridas", href: "/admin/corridas", icon: Truck },
  { label: "Clientes", href: "/admin/clientes", icon: Users },
  { label: "Prestadores", href: "/admin/prestadores", icon: Wrench },
  { label: "Financeiro", href: "/admin/financeiro", icon: DollarSign },
  { label: "Configuracoes", href: "/admin/config", icon: Settings },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="hidden w-56 flex-col bg-[#1a1a1a] text-white md:flex">
        {/* Logo */}
        <div className="border-b border-gray-700 px-5 py-5">
          <Link href="/admin" className="text-xl font-extrabold">
            <span className="text-[#00C896]">Pegue</span>{" "}
            <span className="text-sm font-normal text-gray-400">Admin</span>
          </Link>
        </div>

        {/* Menu */}
        <nav className="flex-1 py-4">
          {menuItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
                  isActive
                    ? "bg-[#00C896] font-semibold text-[#1a1a1a]"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-700 px-5 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-white"
          >
            <LogOut size={16} />
            Ver site
          </Link>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="flex w-full flex-col md:hidden">
        <div className="flex items-center justify-between bg-[#1a1a1a] px-4 py-3 text-white">
          <Link href="/admin" className="text-lg font-extrabold">
            <span className="text-[#00C896]">Pegue</span> Admin
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto bg-[#1a1a1a] px-2 pb-2">
          {menuItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs ${
                  isActive
                    ? "bg-[#00C896] font-semibold text-[#1a1a1a]"
                    : "text-gray-400"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
    </div>
  );
}

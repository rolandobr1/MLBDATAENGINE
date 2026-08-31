/**
 * Modal de selección/registro de usuario al abrir Bet Tracking.
 * Extraído de BetTracking.tsx (Fase 6, punto 1 del plan de mejora).
 */

import React, { useState } from "react";
import { X, User } from "lucide-react";

export const UserModal: React.FC<{ onSave: (name: string) => void, onClose: () => void, onDeleteUser: (name: string) => void, globalUsers?: string[] }> = ({ onSave, onClose, onDeleteUser, globalUsers = [] }) => {
  const [name, setName] = useState("");
  const existingUsers = Array.from(new Set([...globalUsers]));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 space-y-4 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-full transition-colors">
          <X size={16} />
        </button>
        <div className="flex flex-col items-center gap-2">
          <div className="w-14 h-14 bg-violet-100 rounded-full flex items-center justify-center"><User size={28} className="text-violet-600" /></div>
          <h2 className="font-bold text-lg text-slate-800">Bienvenido a Bet Tracking</h2>
          <p className="text-xs text-slate-500 text-center">Selecciona un usuario existente o escribe tu nombre.</p>
        </div>

        {existingUsers.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {existingUsers.map(u => (
              <div key={u} className="relative group">
                <button onClick={() => { setName(u); onSave(u); }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-violet-100 text-slate-600 hover:text-violet-700 text-xs font-bold rounded-lg border border-slate-200 transition-colors">
                  {u}
                </button>
                <button onClick={(e) => { e.stopPropagation(); onDeleteUser(u); }}
                  className="absolute -top-1.5 -right-1.5 bg-red-100 text-red-600 p-0.5 rounded-full sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10"
                  title="Eliminar usuario">
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <input type="text" placeholder="Nuevo usuario o alias" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && name.trim() && onSave(name.trim())}
          className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          autoFocus />
        <button onClick={() => name.trim() && onSave(name.trim())}
          className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold rounded-xl hover:from-violet-700 hover:to-indigo-700 transition-all">
          Continuar
        </button>
      </div>
    </div>
  );
};


export default UserModal;

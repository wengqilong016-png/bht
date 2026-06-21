import React from 'react';

interface InputFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon: React.ReactNode;
  type?: string;
  placeholder?: string;
}

const InputField: React.FC<InputFieldProps> = ({ label, value, onChange, icon, type = "text", placeholder }) => (
  <div className="space-y-1 flex-1">
    <label className="text-caption font-black text-[#a09080] uppercase ml-1 tracking-widest">{label}</label>
    <div className="flex items-center bg-white border border-[#e0d8cc] rounded-xl px-4 py-2.5 focus-within:border-amber-400 transition-all">
      <span className="text-[#a09080] mr-2">{icon}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="bg-transparent w-full text-xs font-bold outline-none text-[#171310] placeholder:text-[#c0b0a0] placeholder:font-normal" />
    </div>
  </div>
);

export default InputField;

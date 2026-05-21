import type { ChangeEvent } from 'react';
import { Input, Label, Textarea } from './ui';

interface FormFieldProps {
  id: string;
  label: string;
  max?: number;
  min?: number;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  textarea?: boolean;
  type?: 'text' | 'password' | 'number';
  value: string | number;
}

export function FormField({
  id,
  label,
  max,
  min,
  onChange,
  placeholder,
  rows,
  textarea,
  type = 'text',
  value,
}: FormFieldProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(event.currentTarget.value);
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {textarea ? (
        <Textarea id={id} onChange={handleChange} placeholder={placeholder} rows={rows} value={value} />
      ) : (
        <Input
          className={type === 'number' ? 'w-20 text-center' : 'w-full'}
          id={id}
          max={max}
          min={min}
          onChange={handleChange}
          placeholder={placeholder}
          type={type}
          value={value}
        />
      )}
    </div>
  );
}

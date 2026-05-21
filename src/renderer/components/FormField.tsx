import type { ChangeEvent } from 'react';

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
    <div className="ouchn-field">
      <label className="ouchn-label" htmlFor={id}>
        {label}
      </label>
      {textarea ? (
        <textarea
          className="ouchn-textarea"
          id={id}
          onChange={handleChange}
          placeholder={placeholder}
          rows={rows}
          value={value}
        />
      ) : (
        <input
          className={type === 'number' ? 'ouchn-input ouchn-input-sm' : 'ouchn-input'}
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

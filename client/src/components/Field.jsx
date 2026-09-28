function Field({
  label,
  name,
  type = "text",
  value,
  onChange,
  error,
  placeholder = "",
}) {
  return (
    <div className="form-group">
      <label htmlFor={name}>{label}</label>

      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />

      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

export default Field;
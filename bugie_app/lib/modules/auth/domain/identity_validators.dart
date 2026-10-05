// Reglas de documento y nombres. Son las mismas que valida el backend
// (Auth): si cambian allá, hay que cambiarlas aquí.

/// Tipos de documento aceptados: valor que se envía → texto visible.
const Map<String, String> kDocTypes = {
  'DNI': 'DNI',
  'CE': 'Carné de extranjería',
  'PASAPORTE': 'Pasaporte',
};

String docTypeLabel(String? type) => kDocTypes[type] ?? (type ?? '');

/// Número limpio como lo guarda el backend: sin espacios y en mayúsculas.
String normalizeDocNumber(String value) =>
    value.replaceAll(RegExp(r'\s'), '').toUpperCase();

String? validateDocNumber(String docType, String? value) {
  final v = normalizeDocNumber(value ?? '');
  if (v.isEmpty) return 'El número de documento es obligatorio.';
  switch (docType) {
    case 'DNI':
      if (!RegExp(r'^\d{8}$').hasMatch(v)) return 'El DNI debe tener 8 dígitos.';
      break;
    case 'CE':
      if (!RegExp(r'^[A-Z0-9]{9,12}$').hasMatch(v)) {
        return 'El carné de extranjería debe tener entre 9 y 12 caracteres (solo letras y números).';
      }
      break;
    case 'PASAPORTE':
      if (!RegExp(r'^[A-Z0-9]{6,12}$').hasMatch(v)) {
        return 'El pasaporte debe tener entre 6 y 12 caracteres (solo letras y números).';
      }
      break;
    default:
      return 'Tipo de documento inválido. Usa DNI, CE o PASAPORTE.';
  }
  return null;
}

/// Solo letras (con tildes), espacios, apóstrofo, punto y guion.
final _nameRegex = RegExp(r"^[\p{L}\s'.\-]+$", unicode: true);

/// [emptyMessage] null = campo opcional.
String? validatePersonName(String? value,
    {required int maxLength, String? emptyMessage}) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return emptyMessage;
  if (v.length > maxLength) return 'Máximo $maxLength caracteres.';
  if (!_nameRegex.hasMatch(v)) {
    return 'Solo letras, espacios, apóstrofo, punto o guion.';
  }
  return null;
}

String? validateFirstNames(String? v) => validatePersonName(v,
    maxLength: 60, emptyMessage: 'Los nombres son obligatorios.');

String? validateLastNamePaternal(String? v) => validatePersonName(v,
    maxLength: 40, emptyMessage: 'El apellido paterno es obligatorio.');

String? validateLastNameMaternal(String? v) =>
    validatePersonName(v, maxLength: 40);

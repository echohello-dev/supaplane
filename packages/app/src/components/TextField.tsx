import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { colors, radius, spacing, typography } from "../theme.js";

interface Props extends TextInputProps {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, style, ...rest }: Props) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textDim}
        selectionColor={colors.accent}
        style={[styles.input, error ? styles.inputError : null, style]}
        autoCapitalize="none"
        autoCorrect={false}
        {...rest}
      />
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.textMuted, textTransform: "uppercase" },
  input: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  inputError: { borderColor: colors.danger },
  hint: { ...typography.caption, color: colors.textDim },
  error: { ...typography.caption, color: colors.danger },
});

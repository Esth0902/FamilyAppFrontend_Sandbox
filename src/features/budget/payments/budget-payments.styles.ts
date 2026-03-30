import { StyleSheet } from "react-native";

export const budgetPaymentsStyles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 0, paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listWrap: { gap: 8 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  childHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailsWrap: { gap: 6 },
  innerTitle: { fontSize: 15, fontWeight: "700" },
  text: { fontSize: 13, lineHeight: 18 },
  summaryGrid: { gap: 4, marginTop: 2 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  summaryLabel: { fontSize: 13, flex: 1 },
  summaryValue: { fontSize: 13, fontWeight: "600" },
  summaryValueStrong: { fontSize: 14, fontWeight: "700" },
  primaryBtn: {
    borderRadius: 10,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    paddingHorizontal: 8,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },
});

import { StyleSheet } from "react-native";

export const calendarStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 36,
    paddingHorizontal: 16,
    paddingTop: 56,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerContainer: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  headerContent: {
    minHeight: 0,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  card: {
    borderRadius: 14,
    padding: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  modalHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dayProgramHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  dayProgramHeaderTitle: {
    flex: 1,
    flexShrink: 1,
    lineHeight: 22,
  },
  dayProgramHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  modalIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    fontSize: 13,
    fontWeight: "700",
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  calendarHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  calendarNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarMonthText: {
    fontSize: 17,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  calendarWeekRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  calendarWeekdayText: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -3,
  },
  calendarCell: {
    width: "14.2857%",
    padding: 3,
  },
  calendarDayBtn: {
    width: "100%",
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 5,
  },
  calendarDayInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  calendarDayNumberBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: "700",
  },
  dayBadgesRow: {
    flexDirection: "row",
    gap: 3,
    minHeight: 6,
  },
  dayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sectionBlock: {
    marginTop: 8,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 4,
  },
  itemHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  itemMetaText: {
    fontSize: 12,
    lineHeight: 18,
  },
  itemActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  inlineSummaryBlock: {
    marginTop: 8,
    gap: 2,
  },
  inlineActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inlineActionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  inputMultiline: {
    minHeight: 84,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  timeRow: {
    flexDirection: "row",
    gap: 8,
  },
  dateInput: {
    flex: 1,
  },
  pickerFieldBtn: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pickerFieldText: {
    fontSize: 14,
    fontWeight: "600",
  },
  timeInput: {
    width: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  visibilityRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  visibilityChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  recipePickerRow: {
    gap: 8,
    paddingBottom: 10,
  },
  recipeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  recipeChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    borderRadius: 16,
    maxHeight: "85%",
    padding: 14,
  },
  modalScroll: {
    maxHeight: 480,
  },
  modalContent: {
    paddingBottom: 4,
  },
  modalActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  modalPrimaryBtn: {
    flex: 1,
    marginTop: 0,
  },
  primaryBtn: {
    marginTop: 6,
    borderRadius: 10,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 14,
  },
});




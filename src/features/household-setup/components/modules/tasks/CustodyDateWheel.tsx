import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { WHEEL_CONTAINER_HEIGHT, WHEEL_ITEM_HEIGHT, WHEEL_VERTICAL_PADDING } from "@/src/features/household-setup/utils/householdSetup.constants";

type CustodyDateWheelProps = {
  state: any;
};

export function CustodyDateWheel({ state }: CustodyDateWheelProps) {
  const { theme, constants, data, refs, helpers } = state;

  if (!data.custodyDateWheelVisible) {
    return null;
  }

  return (
    <View
      style={[
        styles.inlineWheelPanel,
        { borderColor: theme.icon, backgroundColor: theme.background },
      ]}
    >
      <Text style={[styles.label, { color: theme.text }]}>
        Choisir la semaine de référence
      </Text>
      <View style={styles.wheelRow}>
        <View style={styles.wheelColumn}>
          <ScrollView
            ref={refs.custodyDayWheelRef}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            snapToInterval={WHEEL_ITEM_HEIGHT}
            decelerationRate="fast"
            contentContainerStyle={styles.wheelContentContainer}
            onScroll={(event) => {
              const index = helpers.wheelIndexFromOffset(
                event.nativeEvent.contentOffset.y,
                data.custodyDayOptions.length
              );
              if (index !== refs.custodyDateDayIndexRef.current) {
                refs.custodyDateDayIndexRef.current = index;
              }
            }}
          >
            {data.custodyDayOptions.map((value: any) => (
              <View key={`custody-wheel-day-${value}`} style={styles.wheelItem}>
                <Text
                  style={[
                    styles.wheelItemText,
                    {
                      color:
                        data.custodyDateWheelDay === value
                          ? theme.text
                          : theme.textSecondary,
                    },
                    data.custodyDateWheelDay === value && styles.wheelItemTextSelected,
                  ]}
                >
                  {`${helpers.weekDayShortLabel(
                    data.custodyDateWheelYear,
                    data.custodyDateWheelMonth,
                    value
                  )} ${helpers.pad2(value)}`}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View
            pointerEvents="none"
            style={[
              styles.wheelSelectionOverlay,
              { borderColor: theme.icon, backgroundColor: `${theme.tint}14` },
            ]}
          />
        </View>
        <View style={styles.wheelColumn}>
          <ScrollView
            ref={refs.custodyMonthWheelRef}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            snapToInterval={WHEEL_ITEM_HEIGHT}
            decelerationRate="fast"
            contentContainerStyle={styles.wheelContentContainer}
            onScroll={(event) => {
              const index = helpers.wheelIndexFromOffset(
                event.nativeEvent.contentOffset.y,
                data.custodyMonthOptions.length
              );
              if (index !== refs.custodyDateMonthIndexRef.current) {
                refs.custodyDateMonthIndexRef.current = index;
              }
            }}
          >
            {data.custodyMonthOptions.map((value: any) => (
              <View key={`custody-wheel-month-${value}`} style={styles.wheelItem}>
                <Text
                  style={[
                    styles.wheelItemText,
                    {
                      color:
                        data.custodyDateWheelMonth === value
                          ? theme.text
                          : theme.textSecondary,
                    },
                    data.custodyDateWheelMonth === value && styles.wheelItemTextSelected,
                  ]}
                >
                  {constants.MONTH_LABELS[value - 1]}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View
            pointerEvents="none"
            style={[
              styles.wheelSelectionOverlay,
              { borderColor: theme.icon, backgroundColor: `${theme.tint}14` },
            ]}
          />
        </View>
        <View style={styles.wheelColumn}>
          <ScrollView
            ref={refs.custodyYearWheelRef}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            snapToInterval={WHEEL_ITEM_HEIGHT}
            decelerationRate="fast"
            contentContainerStyle={styles.wheelContentContainer}
            onScroll={(event) => {
              const index = helpers.wheelIndexFromOffset(
                event.nativeEvent.contentOffset.y,
                data.custodyYearOptions.length
              );
              if (index !== refs.custodyDateYearIndexRef.current) {
                refs.custodyDateYearIndexRef.current = index;
              }
            }}
          >
            {data.custodyYearOptions.map((value: any) => (
              <View key={`custody-wheel-year-${value}`} style={styles.wheelItem}>
                <Text
                  style={[
                    styles.wheelItemText,
                    {
                      color:
                        data.custodyDateWheelYear === value
                          ? theme.text
                          : theme.textSecondary,
                    },
                    data.custodyDateWheelYear === value && styles.wheelItemTextSelected,
                  ]}
                >
                  {value}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View
            pointerEvents="none"
            style={[
              styles.wheelSelectionOverlay,
              { borderColor: theme.icon, backgroundColor: `${theme.tint}14` },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineWheelPanel: { borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 10 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  wheelRow: { flexDirection: "row", gap: 8 },
  wheelColumn: { flex: 1, height: WHEEL_CONTAINER_HEIGHT, position: "relative" },
  wheelContentContainer: { paddingVertical: WHEEL_VERTICAL_PADDING },
  wheelItem: { height: WHEEL_ITEM_HEIGHT, alignItems: "center", justifyContent: "center" },
  wheelItemText: { fontSize: 16, fontWeight: "500" },
  wheelItemTextSelected: { fontWeight: "700" },
  wheelSelectionOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: WHEEL_VERTICAL_PADDING,
    height: WHEEL_ITEM_HEIGHT,
    borderWidth: 1,
    borderRadius: 10,
  },
});

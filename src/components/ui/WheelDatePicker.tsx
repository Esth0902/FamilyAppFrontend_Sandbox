import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { parseOptionalIsoDate } from "@/src/utils/date";

const WHEEL_ITEM_HEIGHT = 40;
const WHEEL_VISIBLE_ROWS = 5;
const WHEEL_CONTAINER_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS;
const WHEEL_VERTICAL_PADDING = (WHEEL_CONTAINER_HEIGHT - WHEEL_ITEM_HEIGHT) / 2;
const TIME_WHEEL_REPEAT = 8;
const TIME_WHEEL_MIDDLE_CYCLE = Math.floor(TIME_WHEEL_REPEAT / 2);
const MONTH_LABELS = ["jan", "fev", "mars", "avr", "mai", "juin", "juil", "aout", "sept", "oct", "nov", "dec"];
const WEEK_DAY_SHORT = ["di", "lu", "ma", "me", "je", "ve", "sa"] as const;

const pad = (value: number) => String(value).padStart(2, "0");
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const positiveModulo = (value: number, mod: number) => ((value % mod) + mod) % mod;
const wheelIndexFromOffset = (offsetY: number, size: number) =>
  clamp(Math.round(offsetY / WHEEL_ITEM_HEIGHT), 0, Math.max(0, size - 1));

const parseTimeValue = (value: string) => {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  return {
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 18,
    minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0,
  };
};

const weekDayShortLabel = (year: number, month: number, day: number) => {
  const date = new Date(year, month - 1, day);
  return WEEK_DAY_SHORT[date.getDay()] ?? "";
};

export type WheelPickerTheme = {
  background: string;
  text: string;
  textSecondary: string;
  tint: string;
  icon: string;
};

type WheelDatePickerProps = {
  visible: boolean;
  title: string;
  value: string;
  onChange: (nextIsoDate: string) => void;
  theme: WheelPickerTheme;
};

export function WheelDatePicker({
  visible,
  title,
  value,
  onChange,
  theme,
}: WheelDatePickerProps) {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const yearOptions = useMemo(() => Array.from({ length: 11 }, (_, index) => currentYear - 5 + index), [currentYear]);
  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, index) => index + 1), []);

  const [wheelYear, setWheelYear] = useState(currentYear);
  const [wheelMonth, setWheelMonth] = useState(new Date().getMonth() + 1);
  const [wheelDay, setWheelDay] = useState(new Date().getDate());

  const yearWheelRef = useRef<ScrollView | null>(null);
  const monthWheelRef = useRef<ScrollView | null>(null);
  const dayWheelRef = useRef<ScrollView | null>(null);
  const dateWheelDayIndexRef = useRef(0);
  const dateWheelMonthIndexRef = useRef(0);
  const dateWheelYearIndexRef = useRef(0);
  const lastEmittedDateRef = useRef<string | null>(null);

  const dayOptions = useMemo(() => {
    const maxDay = new Date(wheelYear, wheelMonth, 0).getDate();
    return Array.from({ length: maxDay }, (_, index) => index + 1);
  }, [wheelMonth, wheelYear]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    if (value === lastEmittedDateRef.current) {
      return;
    }

    const sourceDate = parseOptionalIsoDate(value);
    const safeDate = sourceDate && !Number.isNaN(sourceDate.getTime()) ? sourceDate : new Date();
    const year = safeDate.getFullYear();
    const month = safeDate.getMonth() + 1;
    const day = safeDate.getDate();
    const yearIndex = Math.max(0, yearOptions.indexOf(year));
    const monthIndex = Math.max(0, monthOptions.indexOf(month));
    const dayIndex = Math.max(0, day - 1);

    const nextYear = yearOptions[yearIndex] ?? currentYear;
    const nextMonth = monthOptions[monthIndex] ?? 1;

    setWheelYear((prev) => (prev === nextYear ? prev : nextYear));
    setWheelMonth((prev) => (prev === nextMonth ? prev : nextMonth));
    setWheelDay((prev) => (prev === day ? prev : day));

    dateWheelYearIndexRef.current = yearIndex;
    dateWheelMonthIndexRef.current = monthIndex;
    dateWheelDayIndexRef.current = dayIndex;

    requestAnimationFrame(() => {
      yearWheelRef.current?.scrollTo({ y: yearIndex * WHEEL_ITEM_HEIGHT, animated: false });
      monthWheelRef.current?.scrollTo({ y: monthIndex * WHEEL_ITEM_HEIGHT, animated: false });
      dayWheelRef.current?.scrollTo({ y: dayIndex * WHEEL_ITEM_HEIGHT, animated: false });
    });
  }, [currentYear, monthOptions, value, visible, yearOptions]);

  useEffect(() => {
    const maxDay = dayOptions.length;
    setWheelDay((prev) => clamp(prev, 1, maxDay));
  }, [dayOptions.length]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const maxDay = new Date(wheelYear, wheelMonth, 0).getDate();
    const normalizedDay = clamp(wheelDay, 1, maxDay);
    if (normalizedDay !== wheelDay) {
      setWheelDay(normalizedDay);
      return;
    }

    const nextIsoDate = `${wheelYear}-${pad(wheelMonth)}-${pad(normalizedDay)}`;
    if (nextIsoDate === value) {
      return;
    }

    lastEmittedDateRef.current = nextIsoDate;
    onChange(nextIsoDate);
  }, [onChange, value, visible, wheelDay, wheelMonth, wheelYear]);

  if (!visible) {
    return null;
  }

  return (
    <View style={[styles.inlineWheelPanel, { borderColor: theme.icon, backgroundColor: theme.background }]}>
      <Text style={[styles.label, { color: theme.text }]}>{title}</Text>

      <View style={styles.wheelRow}>
        <View style={styles.wheelColumn}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            ref={dayWheelRef}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            snapToInterval={WHEEL_ITEM_HEIGHT}
            decelerationRate="fast"
            scrollEventThrottle={32}
            contentContainerStyle={styles.wheelContentContainer}
            onScroll={(event) => {
              const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, dayOptions.length);
              if (index === dateWheelDayIndexRef.current) {
                return;
              }
              dateWheelDayIndexRef.current = index;
              setWheelDay(dayOptions[index]);
            }}
          >
            {dayOptions.map((valueOption) => (
              <View key={`wheel-day-${valueOption}`} style={styles.wheelItem}>
                <Text
                  style={[
                    styles.wheelItemText,
                    { color: wheelDay === valueOption ? theme.text : theme.textSecondary },
                    wheelDay === valueOption && styles.wheelItemTextSelected,
                  ]}
                >
                  {`${weekDayShortLabel(wheelYear, wheelMonth, valueOption)} ${pad(valueOption)}`}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View
            pointerEvents="none"
            style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]}
          />
        </View>

        <View style={styles.wheelColumn}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            ref={monthWheelRef}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            snapToInterval={WHEEL_ITEM_HEIGHT}
            decelerationRate="fast"
            scrollEventThrottle={32}
            contentContainerStyle={styles.wheelContentContainer}
            onScroll={(event) => {
              const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, monthOptions.length);
              if (index === dateWheelMonthIndexRef.current) {
                return;
              }
              dateWheelMonthIndexRef.current = index;
              setWheelMonth(monthOptions[index]);
            }}
          >
            {monthOptions.map((valueOption) => (
              <View key={`wheel-month-${valueOption}`} style={styles.wheelItem}>
                <Text
                  style={[
                    styles.wheelItemText,
                    { color: wheelMonth === valueOption ? theme.text : theme.textSecondary },
                    wheelMonth === valueOption && styles.wheelItemTextSelected,
                  ]}
                >
                  {MONTH_LABELS[valueOption - 1]}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View
            pointerEvents="none"
            style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]}
          />
        </View>

        <View style={styles.wheelColumn}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            ref={yearWheelRef}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            snapToInterval={WHEEL_ITEM_HEIGHT}
            decelerationRate="fast"
            scrollEventThrottle={32}
            contentContainerStyle={styles.wheelContentContainer}
            onScroll={(event) => {
              const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, yearOptions.length);
              if (index === dateWheelYearIndexRef.current) {
                return;
              }
              dateWheelYearIndexRef.current = index;
              setWheelYear(yearOptions[index]);
            }}
          >
            {yearOptions.map((valueOption) => (
              <View key={`wheel-year-${valueOption}`} style={styles.wheelItem}>
                <Text
                  style={[
                    styles.wheelItemText,
                    { color: wheelYear === valueOption ? theme.text : theme.textSecondary },
                    wheelYear === valueOption && styles.wheelItemTextSelected,
                  ]}
                >
                  {valueOption}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View
            pointerEvents="none"
            style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]}
          />
        </View>
      </View>
    </View>
  );
}

type WheelTimePickerProps = {
  visible: boolean;
  title: string;
  value: string;
  onChange: (nextTime: string) => void;
  theme: WheelPickerTheme;
};

export function WheelTimePicker({
  visible,
  title,
  value,
  onChange,
  theme,
}: WheelTimePickerProps) {
  const hourWheelRef = useRef<ScrollView | null>(null);
  const minuteWheelRef = useRef<ScrollView | null>(null);
  const timeWheelHourIndexRef = useRef(TIME_WHEEL_MIDDLE_CYCLE * 24 + 18);
  const timeWheelMinuteIndexRef = useRef(TIME_WHEEL_MIDDLE_CYCLE * 60);
  const lastEmittedTimeRef = useRef<string | null>(null);

  const [timeWheelHour, setTimeWheelHour] = useState(18);
  const [timeWheelMinute, setTimeWheelMinute] = useState(0);
  const [timeWheelHourIndex, setTimeWheelHourIndex] = useState(TIME_WHEEL_MIDDLE_CYCLE * 24 + 18);
  const [timeWheelMinuteIndex, setTimeWheelMinuteIndex] = useState(TIME_WHEEL_MIDDLE_CYCLE * 60);

  const hourOptions = useMemo(
    () => Array.from({ length: 24 * TIME_WHEEL_REPEAT }, (_, index) => positiveModulo(index, 24)),
    []
  );
  const minuteOptions = useMemo(
    () => Array.from({ length: 60 * TIME_WHEEL_REPEAT }, (_, index) => positiveModulo(index, 60)),
    []
  );

  useEffect(() => {
    if (!visible) {
      return;
    }
    if (value === lastEmittedTimeRef.current) {
      return;
    }

    const parsed = parseTimeValue(value);
    const hour = parsed.hour;
    const minute = parsed.minute;
    const hourIndex = TIME_WHEEL_MIDDLE_CYCLE * 24 + hour;
    const minuteIndex = TIME_WHEEL_MIDDLE_CYCLE * 60 + minute;

    setTimeWheelHour((prev) => (prev === hour ? prev : hour));
    setTimeWheelMinute((prev) => (prev === minute ? prev : minute));

    timeWheelHourIndexRef.current = hourIndex;
    timeWheelMinuteIndexRef.current = minuteIndex;
    setTimeWheelHourIndex((prev) => (prev === hourIndex ? prev : hourIndex));
    setTimeWheelMinuteIndex((prev) => (prev === minuteIndex ? prev : minuteIndex));

    requestAnimationFrame(() => {
      hourWheelRef.current?.scrollTo({ y: hourIndex * WHEEL_ITEM_HEIGHT, animated: false });
      minuteWheelRef.current?.scrollTo({ y: minuteIndex * WHEEL_ITEM_HEIGHT, animated: false });
    });
  }, [value, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const nextTime = `${pad(timeWheelHour)}:${pad(timeWheelMinute)}`;
    if (nextTime === value) {
      return;
    }

    lastEmittedTimeRef.current = nextTime;
    onChange(nextTime);
  }, [onChange, timeWheelHour, timeWheelMinute, value, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View style={[styles.inlineWheelPanel, { borderColor: theme.icon, backgroundColor: theme.background }]}>
      <Text style={[styles.label, { color: theme.text }]}>{title}</Text>

      <View style={styles.wheelRow}>
        <View style={styles.wheelColumn}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            ref={hourWheelRef}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            snapToInterval={WHEEL_ITEM_HEIGHT}
            decelerationRate="fast"
            scrollEventThrottle={32}
            contentContainerStyle={styles.wheelContentContainer}
            onScroll={(event) => {
              const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, hourOptions.length);
              if (index === timeWheelHourIndexRef.current) {
                return;
              }
              timeWheelHourIndexRef.current = index;
              setTimeWheelHourIndex(index);
              setTimeWheelHour(hourOptions[index]);
            }}
            onMomentumScrollEnd={(event) => {
              const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, hourOptions.length);
              const valueOption = hourOptions[index];
              const middleIndex = TIME_WHEEL_MIDDLE_CYCLE * 24 + valueOption;
              if (Math.abs(index - middleIndex) > 48) {
                hourWheelRef.current?.scrollTo({ y: middleIndex * WHEEL_ITEM_HEIGHT, animated: false });
                timeWheelHourIndexRef.current = middleIndex;
                setTimeWheelHourIndex(middleIndex);
              }
            }}
          >
            {hourOptions.map((valueOption, index) => (
              <View key={`wheel-hour-${index}`} style={styles.wheelItem}>
                <Text
                  style={[
                    styles.wheelItemText,
                    { color: timeWheelHourIndex === index ? theme.text : theme.textSecondary },
                    timeWheelHourIndex === index && styles.wheelItemTextSelected,
                  ]}
                >
                  {pad(valueOption)}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View
            pointerEvents="none"
            style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]}
          />
        </View>

        <View style={styles.wheelColumn}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            ref={minuteWheelRef}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            snapToInterval={WHEEL_ITEM_HEIGHT}
            decelerationRate="fast"
            scrollEventThrottle={32}
            contentContainerStyle={styles.wheelContentContainer}
            onScroll={(event) => {
              const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, minuteOptions.length);
              if (index === timeWheelMinuteIndexRef.current) {
                return;
              }
              timeWheelMinuteIndexRef.current = index;
              setTimeWheelMinuteIndex(index);
              setTimeWheelMinute(minuteOptions[index]);
            }}
            onMomentumScrollEnd={(event) => {
              const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, minuteOptions.length);
              const valueOption = minuteOptions[index];
              const middleIndex = TIME_WHEEL_MIDDLE_CYCLE * 60 + valueOption;
              if (Math.abs(index - middleIndex) > 120) {
                minuteWheelRef.current?.scrollTo({ y: middleIndex * WHEEL_ITEM_HEIGHT, animated: false });
                timeWheelMinuteIndexRef.current = middleIndex;
                setTimeWheelMinuteIndex(middleIndex);
              }
            }}
          >
            {minuteOptions.map((valueOption, index) => (
              <View key={`wheel-minute-${index}`} style={styles.wheelItem}>
                <Text
                  style={[
                    styles.wheelItemText,
                    { color: timeWheelMinuteIndex === index ? theme.text : theme.textSecondary },
                    timeWheelMinuteIndex === index && styles.wheelItemTextSelected,
                  ]}
                >
                  {pad(valueOption)}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View
            pointerEvents="none"
            style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  inlineWheelPanel: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  wheelRow: {
    flexDirection: "row",
    gap: 8,
  },
  wheelColumn: {
    flex: 1,
    height: WHEEL_CONTAINER_HEIGHT,
    position: "relative",
  },
  wheelContentContainer: {
    paddingVertical: WHEEL_VERTICAL_PADDING,
  },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  wheelItemText: {
    fontSize: 16,
    fontWeight: "500",
  },
  wheelItemTextSelected: {
    fontWeight: "700",
  },
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

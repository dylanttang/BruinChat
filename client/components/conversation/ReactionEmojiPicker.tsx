import {
  View,
  Text,
  TextInput,
  Modal,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import emojiData from "rn-emoji-keyboard/src/assets/emojis.json";
import { useTheme, fonts, Colors } from "../../context/ThemeContext";
import {
  buildEmojiColumns,
  sectionAtOffset,
  searchEmojis,
  addRecentEmoji,
  type EmojiColumn,
  type EmojiSection,
  type GridEmoji,
} from "../../lib/emojiGrid";

const ROWS = 5;
const CELL = 44;
const SECTION_GAP = 12;
const RECENT_LIMIT = 30;
const RECENT_KEY = "recentReactionEmojis";

const CATEGORIES: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "smileys_emotion", label: "Smileys & Emotion", icon: "happy-outline" },
  { key: "people_body", label: "People", icon: "hand-left-outline" },
  { key: "animals_nature", label: "Animals & Nature", icon: "paw-outline" },
  { key: "food_drink", label: "Food & Drink", icon: "fast-food-outline" },
  { key: "travel_places", label: "Travel & Places", icon: "car-outline" },
  { key: "activities", label: "Activities", icon: "football-outline" },
  { key: "objects", label: "Objects", icon: "bulb-outline" },
  { key: "symbols", label: "Symbols", icon: "heart-outline" },
  { key: "flags", label: "Flags", icon: "flag-outline" },
];

const SECTIONS: EmojiSection[] = CATEGORIES.map(({ key }) => ({
  key,
  emojis: (emojiData as { title: string; data: GridEmoji[] }[]).find((group) => group.title === key)?.data ?? [],
}));
const ALL_EMOJIS = SECTIONS.flatMap((section) => section.emojis);

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
};

export default function ReactionEmojiPicker({ open, onClose, onSelect }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<EmojiColumn>>(null);

  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState(0);
  const [pendingJump, setPendingJump] = useState<number | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => { if (raw) setRecent(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveSection(0);
  }, [open]);

  const searching = query.trim().length > 0;

  // Recent emojis lead the strip, like iMessage's "Frequently Used".
  const tabs = useMemo(() => [
    ...(recent.length > 0 ? [{ key: "recent", label: "Recently Used", icon: "time-outline" as const }] : []),
    ...CATEGORIES,
  ], [recent.length]);

  const sections = useMemo<EmojiSection[]>(() => {
    if (searching) return [{ key: "search", emojis: searchEmojis(ALL_EMOJIS, query) }];
    const recentSection = recent.map((emoji) => ({ emoji, name: emoji }));
    return [...(recent.length > 0 ? [{ key: "recent", emojis: recentSection }] : []), ...SECTIONS];
  }, [searching, query, recent]);

  const { columns, sectionOffsets } = useMemo(
    () => buildEmojiColumns(sections, ROWS, CELL, SECTION_GAP),
    [sections],
  );

  const handleSelect = useCallback((emoji: string) => {
    onSelect(emoji);
    onClose();
    setRecent((prev) => {
      const next = addRecentEmoji(prev, emoji, RECENT_LIMIT);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [onSelect, onClose]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (searching) return;
    const next = sectionAtOffset(sectionOffsets, event.nativeEvent.contentOffset.x);
    setActiveSection((prev) => (prev === next ? prev : next));
  }, [searching, sectionOffsets]);

  const jumpToSection = (index: number) => {
    if (searching) setQuery("");
    setActiveSection(index);
    setPendingJump(index);
  };

  // Scroll once the strip is back to all categories (a tab tap clears search).
  useEffect(() => {
    if (pendingJump === null || searching) return;
    listRef.current?.scrollToOffset({ offset: sectionOffsets[pendingJump] ?? 0, animated: false });
    setPendingJump(null);
  }, [pendingJump, searching, sectionOffsets]);

  const renderColumn = useCallback(
    ({ item }: { item: EmojiColumn }) => (
      <EmojiColumnView column={item} onSelect={handleSelect} styles={styles} />
    ),
    [handleSelect, styles],
  );

  const sectionTitle = searching
    ? "Search Results"
    : tabs[activeSection]?.label ?? "";

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close emoji picker" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.knob} />
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.mutedText} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search emoji"
              placeholderTextColor={colors.mutedText}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>

          <Text style={styles.sectionTitle}>{sectionTitle}</Text>
          {searching && columns.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No emoji found</Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              key={searching ? "search" : "all"}
              data={columns}
              keyExtractor={(column) => column.key}
              renderItem={renderColumn}
              horizontal
              showsHorizontalScrollIndicator={false}
              getItemLayout={(_, index) => ({
                length: columns[index].width,
                offset: columns[index].offset,
                index,
              })}
              onScroll={handleScroll}
              scrollEventThrottle={32}
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={7}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.grid}
              style={styles.gridList}
            />
          )}

          <View style={styles.tabBar}>
            {tabs.map((tab, index) => {
              const active = !searching && index === activeSection;
              return (
                <Pressable
                  key={tab.key}
                  style={[styles.tab, active && styles.tabActive]}
                  onPress={() => jumpToSection(index)}
                  accessibilityLabel={tab.label}
                  hitSlop={4}
                >
                  <Ionicons name={tab.icon} size={20} color={active ? colors.brand : colors.mutedText} />
                </Pressable>
              );
            })}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const EmojiColumnView = memo(function EmojiColumnView({
  column,
  onSelect,
  styles,
}: {
  column: EmojiColumn;
  onSelect: (emoji: string) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={{ width: column.width, alignItems: "flex-end" }}>
      {column.emojis.map((item) => (
        <Pressable
          key={item.emoji}
          style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
          onPress={() => onSelect(item.emoji)}
          accessibilityLabel={item.name}
        >
          <Text style={styles.emoji} allowFontScaling={false}>{item.emoji}</Text>
        </Pressable>
      ))}
    </View>
  );
});

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: colors.overlay,
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingTop: 8,
    },
    knob: {
      alignSelf: "center",
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.border,
      marginBottom: 10,
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 12,
      paddingHorizontal: 12,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.inputBg,
    },
    searchInput: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: 15,
      color: colors.text,
      paddingVertical: 0,
    },
    sectionTitle: {
      fontFamily: fonts.medium,
      fontSize: 12,
      color: colors.subtext,
      marginTop: 10,
      marginBottom: 2,
      marginHorizontal: 16,
    },
    gridList: {
      height: ROWS * CELL,
      flexGrow: 0,
    },
    grid: {
      paddingHorizontal: 6,
    },
    cell: {
      width: CELL,
      height: CELL,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
    },
    cellPressed: {
      backgroundColor: colors.brandSoft,
    },
    emoji: {
      fontSize: 30,
    },
    empty: {
      height: ROWS * CELL,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: {
      fontFamily: fonts.regular,
      fontSize: 14,
      color: colors.mutedText,
    },
    tabBar: {
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "center",
      marginTop: 6,
      paddingHorizontal: 8,
      paddingTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    tab: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    tabActive: {
      backgroundColor: colors.brandSoft,
    },
  });
}

import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Colors, fonts, useTheme } from "../context/ThemeContext";

// Just enough markdown for the legal documents in docs/legal/: headings,
// paragraphs, bullet lists, tables, **bold** and `code`. Not a general parser.

type Block =
  | { kind: "h1" | "h2" | "h3" | "p"; text: string }
  | { kind: "li"; text: string }
  | { kind: "table"; rows: string[][] };

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.split("\n");
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "p", text: paragraph.join(" ") });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      flushParagraph();
    } else if (line.startsWith("### ")) {
      flushParagraph();
      blocks.push({ kind: "h3", text: line.slice(4) });
    } else if (line.startsWith("## ")) {
      flushParagraph();
      blocks.push({ kind: "h2", text: line.slice(3) });
    } else if (line.startsWith("# ")) {
      flushParagraph();
      blocks.push({ kind: "h1", text: line.slice(2) });
    } else if (line.startsWith("- ")) {
      flushParagraph();
      blocks.push({ kind: "li", text: line.slice(2) });
    } else if (line.startsWith("|")) {
      flushParagraph();
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().slice(1, -1).split("|").map((cell) => cell.trim());
        // Skip the |---|---| separator row.
        if (!cells.every((cell) => /^:?-+:?$/.test(cell))) rows.push(cells);
        i++;
      }
      i--;
      blocks.push({ kind: "table", rows });
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  return blocks;
}

function Inline({ text, style, styles }: { text: string; style: any; styles: ReturnType<typeof makeStyles> }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((part, index) => {
        if (part.startsWith("**")) {
          return <Text key={index} style={styles.bold}>{part.slice(2, -2)}</Text>;
        }
        if (part.startsWith("`")) {
          return <Text key={index} style={styles.code}>{part.slice(1, -1)}</Text>;
        }
        return part;
      })}
    </Text>
  );
}

export default function Markdown({ source }: { source: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const blocks = useMemo(() => parseBlocks(source), [source]);

  return (
    <View>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "h1":
          case "h2":
          case "h3":
            return <Inline key={index} text={block.text} style={styles[block.kind]} styles={styles} />;
          case "p":
            return <Inline key={index} text={block.text} style={styles.p} styles={styles} />;
          case "li":
            return (
              <View key={index} style={styles.li}>
                <Text style={styles.bullet}>•</Text>
                <Inline text={block.text} style={styles.liText} styles={styles} />
              </View>
            );
          case "table": {
            // Tables are narrow on a phone, so render each row as a card:
            // first cell as the title, remaining cells labelled by header.
            const [header, ...rows] = block.rows;
            return (
              <View key={index} style={styles.table}>
                {rows.map((row, rowIndex) => (
                  <View key={rowIndex} style={[styles.tableRow, rowIndex === rows.length - 1 && styles.lastRow]}>
                    <Inline text={row[0]} style={styles.tableTitle} styles={styles} />
                    {row.slice(1).map((cell, cellIndex) => (
                      <Text key={cellIndex} style={styles.tableCell}>
                        <Text style={styles.tableLabel}>{header[cellIndex + 1]}: </Text>
                        {cell}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            );
          }
        }
      })}
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    h1: {
      fontFamily: fonts.bold,
      fontSize: 26,
      color: colors.brand,
      marginBottom: 12,
    },
    h2: {
      fontFamily: fonts.bold,
      fontSize: 19,
      color: colors.text,
      marginTop: 22,
      marginBottom: 8,
    },
    h3: {
      fontFamily: fonts.medium,
      fontSize: 16,
      color: colors.text,
      marginTop: 14,
      marginBottom: 6,
    },
    p: {
      fontFamily: fonts.regular,
      fontSize: 15,
      lineHeight: 22,
      color: colors.subtext,
      marginBottom: 10,
    },
    li: {
      flexDirection: "row",
      marginBottom: 6,
      paddingRight: 8,
    },
    bullet: {
      fontFamily: fonts.bold,
      fontSize: 15,
      lineHeight: 22,
      color: colors.brand,
      width: 18,
    },
    liText: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: 15,
      lineHeight: 22,
      color: colors.subtext,
    },
    bold: {
      fontFamily: fonts.bold,
      color: colors.text,
    },
    code: {
      fontFamily: fonts.medium,
      color: colors.accent,
    },
    table: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.card,
      marginVertical: 8,
      overflow: "hidden",
    },
    tableRow: {
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    lastRow: {
      borderBottomWidth: 0,
    },
    tableTitle: {
      fontFamily: fonts.bold,
      fontSize: 15,
      color: colors.text,
      marginBottom: 4,
    },
    tableCell: {
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 20,
      color: colors.subtext,
    },
    tableLabel: {
      fontFamily: fonts.medium,
      color: colors.text,
    },
  });
}

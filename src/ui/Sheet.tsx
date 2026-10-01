import { Modal, Pressable, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Heading } from "./Text";

type Props = { visible: boolean; onClose: () => void; title: string; children: React.ReactNode };

export function Sheet({ visible, onClose, title, children }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose} accessibilityLabel="Close sheet" />
      <View style={{ backgroundColor: theme.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: theme.space.xl, paddingBottom: theme.space.xxl, gap: theme.space.lg }}>
        <Heading style={{ fontSize: 22 }}>{title}</Heading>
        {children}
      </View>
    </Modal>
  );
}

import { Btn } from "@/components/common/ui";
import { InlineModal } from "@/components/common/overlay";
import { tx } from "@/lib/i18n";
import { useProto } from "@/state/store";
import type { Loadout } from "@/data/gear";

/**
 * 删除配装前确认。装备、增益、秒伤变化记录一起删，不能恢复；
 * 关联的角色和宏不受影响。删完 toast 一下，右边换成挨着的一套（见 store.removeLoadout）。
 */
export function DeleteLoadoutDialog({
  loadout,
  onClose,
}: {
  loadout: Loadout | null;
  onClose: () => void;
}) {
  const { actions } = useProto();
  if (!loadout) return null;
  const remove = () => {
    actions.removeLoadout(loadout.id);
    actions.toast("manager", "success", tx("已删除「{0}」", loadout.name));
    onClose();
  };
  return (
    <InlineModal
      open
      onClose={onClose}
      title={tx("删除「{0}」？", loadout.name)}
      width={400}
      footer={
        <>
          <Btn variant="ghost" size="md" onClick={onClose}>
            {tx("取消")}
          </Btn>
          <Btn variant="danger" size="md" onClick={remove}>
            {tx("删除")}
          </Btn>
        </>
      }
    >
      <div className="space-y-1 pb-1 text-[13px] leading-relaxed text-paper-2">
        <p>{tx("装备、增益和秒伤变化记录会一起删除，不能恢复。")}</p>
        <p>{tx("关联的角色和宏不受影响。")}</p>
      </div>
    </InlineModal>
  );
}

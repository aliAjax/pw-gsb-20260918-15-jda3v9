import { useState } from "react";
import { addSpecimen, ID_LABEL, PRESS_LABEL, SIZE_LABEL } from "../domain";
import type { AppState, IdentificationStatus, PressStatus, SizeClass } from "../types";

interface Props {
  state: AppState;
  onCommit: (next: AppState, message: string) => void;
  onReject: (message: string) => void;
}

const EMPTY = {
  collectionNo: "",
  species: "",
  location: "",
  altitude: "",
  habitat: "",
  collector: "",
};

export function AddSpecimenForm({ state, onCommit, onReject }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [pressStatus, setPressStatus] = useState<PressStatus>("fresh");
  const [identification, setIdentification] = useState<IdentificationStatus>("pending");
  const [sizeClass, setSizeClass] = useState<SizeClass>("medium");

  const update = (key: keyof typeof EMPTY, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    const res = addSpecimen(state, { ...form, pressStatus, identification, sizeClass });
    if (!res.ok) {
      onReject(res.message);
      return;
    }
    onCommit(res.state, res.message);
    setForm(EMPTY);
    setPressStatus("fresh");
    setIdentification("pending");
    setSizeClass("medium");
  };

  const fields: { key: keyof typeof EMPTY; label: string; placeholder: string }[] = [
    { key: "collectionNo", label: "采集号", placeholder: "如 HX-240618-02" },
    { key: "species", label: "物种名称", placeholder: "鉴定后的学名或暂定名" },
    { key: "location", label: "采集地点", placeholder: "山系 · 坡位 · 小地名" },
    { key: "altitude", label: "海拔", placeholder: "如 1420m" },
    { key: "habitat", label: "生境描述", placeholder: "植被、坡向、湿度等" },
    { key: "collector", label: "采集人", placeholder: "采集队员姓名" },
  ];

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>入库登记</p>
          <h2>新增标本</h2>
        </div>
        <button className="primary" onClick={submit}>
          进入队列
        </button>
      </div>
      <div className="field-grid">
        {fields.map((f) => (
          <label key={f.key}>
            <span>{f.label}</span>
            <input
              value={form[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => update(f.key, e.target.value)}
            />
          </label>
        ))}
        <label>
          <span>压制状态</span>
          <select value={pressStatus} onChange={(e) => setPressStatus(e.target.value as PressStatus)}>
            <option value="fresh">{PRESS_LABEL.fresh}</option>
            <option value="pressed">{PRESS_LABEL.pressed}</option>
          </select>
        </label>
        <label>
          <span>鉴定状态</span>
          <select
            value={identification}
            onChange={(e) => setIdentification(e.target.value as IdentificationStatus)}
          >
            <option value="pending">{ID_LABEL.pending}</option>
            <option value="accepted">{ID_LABEL.accepted}</option>
            <option value="doubtful">{ID_LABEL.doubtful}</option>
            <option value="returned">{ID_LABEL.returned}</option>
          </select>
        </label>
        <label>
          <span>标本尺寸（柜位匹配依据）</span>
          <select value={sizeClass} onChange={(e) => setSizeClass(e.target.value as SizeClass)}>
            <option value="small">{SIZE_LABEL.small}</option>
            <option value="medium">{SIZE_LABEL.medium}</option>
            <option value="large">{SIZE_LABEL.large}</option>
          </select>
        </label>
      </div>
      <p className="hint">
        仅“已压制 + 鉴定接受”的标本可上柜；录入即进入入库队列，改判记录全程留存。
      </p>
    </section>
  );
}

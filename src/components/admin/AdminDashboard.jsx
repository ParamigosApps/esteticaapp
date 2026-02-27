import GabinetesPanel from "./GabinetesPanel";
import ServiciosPanel from "./ServiciosPanel";

export default function AdminDashboard() {
  return (
    <div style={{ padding: 20 }}>
      <GabinetesPanel />
      <ServiciosPanel />
    </div>
  );
}

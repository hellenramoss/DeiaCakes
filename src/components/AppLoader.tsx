type AppLoaderProps = {
  message?: string;
  logoSrc?: string;
  overlay?: boolean;
};

const defaultLogo = "/DeiaCakes/deia-logo.webp";

export default function AppLoader({
  message = "Carregando Déia Cake Ateliê...",
  logoSrc,
  overlay = true
}: AppLoaderProps) {
  const logo = logoSrc || defaultLogo;

  return (
    <div className={overlay ? "brand-loader brand-loader-overlay" : "brand-loader"} role="status" aria-live="polite">
      <div className="brand-loader-content">
        <div className="brand-loader-stage" aria-hidden="true">
          <img className="brand-loader-piece piece-a" src={logo} alt="" />
          <img className="brand-loader-piece piece-b" src={logo} alt="" />
          <img className="brand-loader-piece piece-c" src={logo} alt="" />
          <img className="brand-loader-piece piece-d" src={logo} alt="" />
          <img className="brand-loader-piece piece-e" src={logo} alt="" />
          <img className="brand-loader-piece piece-f" src={logo} alt="" />
          <div className="brand-loader-ring" />
          <span className="brand-loader-spark spark-a" />
          <span className="brand-loader-spark spark-b" />
          <span className="brand-loader-spark spark-c" />
        </div>

        <div className="brand-loader-progress"><span /></div>
        <p>{message}</p>
      </div>
    </div>
  );
}

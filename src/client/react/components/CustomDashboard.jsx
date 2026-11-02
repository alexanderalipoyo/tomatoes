export function CustomDashboard() {
  return (
    <section
      id="custom-dashboard"
      className="custom-dashboard-section"
      aria-labelledby="custom-dashboard-title"
      hidden
    >
      <div className="widget-heading">
        <div>
          <span className="eyebrow">{"YOUR SPEC GROUPS"}</span>
          <h2 id="custom-dashboard-title">
            {" Customized dashboard widgets "}
          </h2>
          <p id="custom-dashboard-source"></p>
        </div>
        <button
          id="open-custom-widget-settings"
          className="button"
          type="button"
          data-access-view="settings"
        >
          {"My widget settings"}
        </button>
      </div>
      <div id="custom-dashboard-content"></div>
    </section>
  );
}

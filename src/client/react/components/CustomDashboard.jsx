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
        <a className="button" href="#settings">
          {"Manage groups"}
        </a>
      </div>
      <div id="custom-dashboard-content"></div>
    </section>
  );
}

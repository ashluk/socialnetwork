import Profilepic from "./profilepic";
import Bioeditor from "./bioeditor";

export default function Profile(props) {
    console.log("props in profile", props);
    return (
        <div>
            <Profilepic
                imageUrl={props.imageUrl}
                first={props.first}
                toggleUploader={() => props.toggleUploader()}
            />
            <Bioeditor
                bio={props.bio}
                bioInApp={(bio) => props.bioInApp(bio)}
            />
            <button className="logout">LOGOUT</button>
        </div>
    );
}
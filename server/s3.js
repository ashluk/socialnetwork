const aws = require("aws-sdk");
const fs = require("fs");
let secrets;
if (process.env.NODE_ENV == "production") {
    secrets = process.env;
} else {
    secrets = require("../secrets");
}

const s3 = new aws.S3({
    accessKeyId: secrets.AWS_KEY,
    secretAccessKey: secrets.AWS_SECRET,
});
//console.log(secrets, "secrets");
module.exports.upload = (req, res, next) => {
    if (!req.file) {
        console.log("multer fail");
        return res.sendStatus(500);
    }
    const { filename, mimetype, size, path } = req.file;
    console.log("const req file", req.file);

    const promise = s3
        .putObject({
            Bucket: "indreamsimages",
            ACL: "public-read",
            Key: filename,
            Body: fs.createReadStream(path),
            ContentType: mimetype,
            ContentLength: size,
        })
        .promise()
        .then(function () {
            next();
            fs.unlink(path, () => {});
        })
        .catch(function (err) {
            console.log(err);
            res.sendStatus(500);
        });

    promise
        .then(() => {
            console.log("image made it to bucket!!!");
            // it worked!!!
        })
        .catch((err) => {
            // uh oh
            console.log(err);
        });
};
module.exports.delete = (filename) => {
    s3.deleteObject(
        {
            Bucket: "indreamsimages",
            Key: filename,
        },
        function (err, data) {
            if (err) console.log(err, err.stack);
            else console.log(data);
        }
    );
};

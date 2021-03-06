# -*- coding: utf-8 -*-


class AnnotationEvent(object):
    """An event representing an action on an annotation."""

    def __init__(self, request, annotation_id, action, annotation_dict=None):
        self.request = request
        self.annotation_id = annotation_id
        self.action = action
        self.annotation_dict = annotation_dict


class AnnotationTransformEvent(object):

    """
    An event fired before an annotation is indexed or otherwise needs to be
    transformed by third-party code.

    This event can be used by subscribers who wish to modify the content of an
    annotation just before it is indexed or in other use-cases.
    """

    def __init__(self, request, annotation_dict):
        self.request = request
        self.annotation_dict = annotation_dict
